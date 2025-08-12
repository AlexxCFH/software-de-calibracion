// Backend/services/serialConnection.js
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

class ArduinoSerialConnection {
  constructor() {
    this.port = null;
    this.parser = null;
    this.isConnected = false;
    this.currentData = {
      throttle: { value: 0, percentage: 0, active: false },
      brake: { value: 0, percentage: 0, active: false },
      clutch: { value: 0, percentage: 0, active: false },
      status: 'LIBERADOS',
      timestamp: Date.now()
    };
    this.dataCallback = null;
    this.connectionAttempts = 0;
    this.maxRetries = 5;
  }

  // Buscar puertos disponibles
  async findArduinoPorts() {
    try {
      const ports = await SerialPort.list();
      console.log('\n🔍 Puertos serie disponibles:');
      console.log('════════════════════════════════════════');
      
      const potentialPorts = ports.filter(port => {
        // Buscar puertos que puedan ser Arduino
        const manufacturer = (port.manufacturer || '').toLowerCase();
        const vendorId = (port.vendorId || '').toLowerCase();
        
        return manufacturer.includes('arduino') || 
               manufacturer.includes('ch340') ||
               manufacturer.includes('ftdi') ||
               manufacturer.includes('silicon') ||
               vendorId === '2341' || // Arduino oficial
               vendorId === '1a86' || // CH340
               port.path.includes('ttyUSB') ||
               port.path.includes('ttyACM') ||
               port.path.includes('COM');
      });

      ports.forEach((port, index) => {
        const isCandidate = potentialPorts.includes(port);
        console.log(`${index + 1}. ${port.path} ${isCandidate ? '🎯' : ''}
           Fabricante: ${port.manufacturer || 'Desconocido'}
           Vendor ID: ${port.vendorId || 'N/A'}
           Product ID: ${port.productId || 'N/A'}`);
      });

      console.log('════════════════════════════════════════');
      console.log(`🎯 Puertos candidatos para Arduino: ${potentialPorts.length}`);
      
      return potentialPorts.length > 0 ? potentialPorts : ports;
    } catch (error) {
      console.error('❌ Error buscando puertos:', error.message);
      return [];
    }
  }

  // Seleccionar puerto manualmente
  async selectPortInteractively() {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    try {
      const availablePorts = await SerialPort.list();
      
      if (availablePorts.length === 0) {
        console.log('❌ No se encontraron puertos serie disponibles');
        rl.close();
        return null;
      }

      console.log('\n🔍 SELECCIÓN DE PUERTO SERIE');
      console.log('════════════════════════════════════════');
      
      // Mostrar todos los puertos disponibles
      availablePorts.forEach((port, index) => {
        const manufacturer = port.manufacturer || 'Desconocido';
        const vendorId = port.vendorId || 'N/A';
        const productId = port.productId || 'N/A';
        
        // Marcar puertos que parecen Arduino
        const isArduinoLike = manufacturer.toLowerCase().includes('arduino') ||
                             manufacturer.toLowerCase().includes('ch340') ||
                             manufacturer.toLowerCase().includes('ftdi') ||
                             vendorId === '2341' || vendorId === '1a86';
        
        const marker = isArduinoLike ? '🎯' : '  ';
        
        console.log(`${marker} ${index + 1}. ${port.path}`);
        console.log(`     Fabricante: ${manufacturer}`);
        console.log(`     Vendor ID: ${vendorId} | Product ID: ${productId}`);
        console.log('');
      });

      console.log('0. Usar modo simulación (sin Arduino)');
      console.log('════════════════════════════════════════');

      return new Promise((resolve) => {
        rl.question('🎮 Selecciona el número del puerto (0 para simulación): ', (answer) => {
          rl.close();
          
          const selection = parseInt(answer);
          
          if (selection === 0) {
            console.log('🎮 Modo simulación seleccionado');
            resolve('SIMULATION_MODE');
          } else if (selection >= 1 && selection <= availablePorts.length) {
            const selectedPort = availablePorts[selection - 1];
            console.log(`✅ Puerto seleccionado: ${selectedPort.path}`);
            resolve(selectedPort.path);
          } else {
            console.log('❌ Selección inválida, usando modo simulación');
            resolve('SIMULATION_MODE');
          }
        });
      });
    } catch (error) {
      console.error('❌ Error en selección de puerto:', error.message);
      rl.close();
      return null;
    }
  }

  // Conectar al Arduino
  async connect(portPath = null, baudRate = 9600, interactive = true) {
    try {
      if (this.isConnected) {
        console.log('⚠️ Ya hay una conexión activa');
        return false;
      }

      let targetPort = portPath;
      
      // Si no se especifica puerto y está en modo interactivo
      if (!targetPort && interactive) {
        targetPort = await this.selectPortInteractively();
        
        if (targetPort === 'SIMULATION_MODE') {
          console.log('🎮 Modo simulación activado por selección del usuario');
          return false;
        }
        
        if (!targetPort) {
          console.log('❌ No se pudo seleccionar un puerto');
          return false;
        }
      } else if (!targetPort) {
        // Modo automático (fallback)
        const availablePorts = await this.findArduinoPorts();
        if (availablePorts.length === 0) {
          console.log('❌ No se encontraron puertos serie disponibles');
          return false;
        }
        targetPort = availablePorts[0].path;
        console.log(`🎯 Usando puerto automático: ${targetPort}`);
      }

      console.log(`🔌 Intentando conectar al puerto: ${targetPort}`);
      
      this.port = new SerialPort({
        path: targetPort,
        baudRate: baudRate,
        dataBits: 8,
        parity: 'none',
        stopBits: 1,
        flowControl: false
      });

      this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\n' }));

      // Configurar eventos
      this.port.on('open', () => {
        this.isConnected = true;
        this.connectionAttempts = 0;
        console.log('✅ Conexión serie establecida');
        console.log(`📡 Puerto: ${targetPort} | Baudios: ${baudRate}`);
      });

      this.port.on('error', (err) => {
        console.error('❌ Error en puerto serie:', err.message);
        this.isConnected = false;
        this.attemptReconnection();
      });

      this.port.on('close', () => {
        console.log('🔌 Conexión serie cerrada');
        this.isConnected = false;
        this.attemptReconnection();
      });

      // Procesar datos recibidos
      this.parser.on('data', (data) => {
        this.parseArduinoData(data.toString().trim());
      });

      return true;
    } catch (error) {
      console.error('❌ Error conectando al Arduino:', error.message);
      this.isConnected = false;
      this.attemptReconnection();
      return false;
    }
  }

  // Conectar a un puerto específico (usado desde API)
  async connectToPort(portPath, baudRate = 9600) {
    console.log(`🔌 Conectando a puerto específico: ${portPath}`);
    return await this.connect(portPath, baudRate, false);
  }

  // Listar y conectar interactivamente
  async connectInteractive() {
    return await this.connect(null, 9600, true);
  }

  // Procesar datos del Arduino
  parseArduinoData(rawData) {
    try {
      // Ejemplo de datos: "Acel: 0/1023 (0%) | Freno: 512/1023 (50%) | Clutch: 0/1023 (0%) | FRENANDO"
      
      // Expresiones regulares para extraer datos
      const throttleMatch = rawData.match(/Acel:\s*(\d+)\/1023\s*\((\d+)%\)/);
      const brakeMatch = rawData.match(/Freno:\s*(\d+)\/1023\s*\((\d+)%\)/);
      const clutchMatch = rawData.match(/Clutch:\s*(\d+)\/1023\s*\((\d+)%\)/);
      const statusMatch = rawData.match(/(ACELERANDO|FRENANDO|EMBRAGUE|LIBERADOS)$/);

      if (throttleMatch && brakeMatch && clutchMatch && statusMatch) {
        // Actualizar datos actuales
        this.currentData = {
          throttle: {
            value: parseInt(throttleMatch[1]),
            percentage: parseInt(throttleMatch[2]),
            active: parseInt(throttleMatch[2]) > 0
          },
          brake: {
            value: parseInt(brakeMatch[1]),
            percentage: parseInt(brakeMatch[2]),
            active: parseInt(brakeMatch[2]) > 0
          },
          clutch: {
            value: parseInt(clutchMatch[1]),
            percentage: parseInt(clutchMatch[2]),
            active: parseInt(clutchMatch[2]) > 0
          },
          status: statusMatch[1],
          timestamp: Date.now(),
          rawData: rawData
        };

        // Mostrar en terminal con formato mejorado
        this.displayPedalData();

        // Ejecutar callback si existe
        if (this.dataCallback) {
          this.dataCallback(this.currentData);
        }
      }
    } catch (error) {
      console.error('❌ Error procesando datos del Arduino:', error.message);
      console.log('📦 Datos recibidos:', rawData);
    }
  }

  // Mostrar datos de pedales en terminal
  displayPedalData() {
    const { throttle, brake, clutch, status } = this.currentData;
    
    // Crear barras de progreso
    const createBar = (percentage, length = 20) => {
      const filled = Math.round((percentage / 100) * length);
      return '█'.repeat(filled) + '░'.repeat(length - filled);
    };

    // Colores ANSI
    const colors = {
      reset: '\x1b[0m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      red: '\x1b[31m',
      blue: '\x1b[34m',
      cyan: '\x1b[36m',
      bold: '\x1b[1m'
    };

    // Determinar color del estado
    let statusColor = colors.green;
    let statusIcon = '🟢';
    
    switch(status) {
      case 'ACELERANDO':
        statusColor = colors.green;
        statusIcon = '🟢';
        break;
      case 'FRENANDO':
        statusColor = colors.red;
        statusIcon = '🔴';
        break;
      case 'EMBRAGUE':
        statusColor = colors.yellow;
        statusIcon = '🟡';
        break;
      case 'LIBERADOS':
        statusColor = colors.cyan;
        statusIcon = '⚪';
        break;
    }

    // Limpiar línea y mostrar datos
    process.stdout.write('\r\x1b[K');
    
    const display = `${colors.bold}🚗 PEDALES:${colors.reset} ` +
                   `${colors.green}🚀${throttle.percentage.toString().padStart(3)}%${colors.reset} ` +
                   `${colors.red}🛑${brake.percentage.toString().padStart(3)}%${colors.reset} ` +
                   `${colors.yellow}🔧${clutch.percentage.toString().padStart(3)}%${colors.reset} ` +
                   `${statusColor}${statusIcon} ${status}${colors.reset}`;
    
    process.stdout.write(display);

    // Mostrar barras detalladas ocasionalmente
    if (Date.now() % 3000 < 100) { // Cada 3 segundos aprox
      console.log('\n');
      console.log(`🚀 Acelerador: ${colors.green}[${createBar(throttle.percentage)}]${colors.reset} ${throttle.percentage}%`);
      console.log(`🛑 Freno:      ${colors.red}[${createBar(brake.percentage)}]${colors.reset} ${brake.percentage}%`);
      console.log(`🔧 Embrague:   ${colors.yellow}[${createBar(clutch.percentage)}]${colors.reset} ${clutch.percentage}%`);
      console.log('────────────────────────────────────────────────');
    }
  }

  // Intentar reconexión automática
  attemptReconnection() {
    if (this.connectionAttempts < this.maxRetries) {
      this.connectionAttempts++;
      console.log(`🔄 Reintentando conexión (${this.connectionAttempts}/${this.maxRetries}) en 3 segundos...`);
      
      setTimeout(() => {
        this.connect();
      }, 3000);
    } else {
      console.log('❌ Máximo número de reintentos alcanzado');
      console.log('💡 Verifica que el Arduino esté conectado y funcionando');
    }
  }

  // Establecer callback para datos
  onDataReceived(callback) {
    this.dataCallback = callback;
  }

  // Obtener datos actuales
  getCurrentData() {
    return this.currentData;
  }

  // Verificar conexión
  isPortConnected() {
    return this.isConnected && this.port && this.port.isOpen;
  }

  // Cerrar conexión
  disconnect() {
    try {
      if (this.port && this.port.isOpen) {
        this.port.close((err) => {
          if (err) {
            console.error('❌ Error cerrando puerto:', err.message);
          } else {
            console.log('✅ Puerto serie cerrado correctamente');
          }
        });
      }
      this.isConnected = false;
    } catch (error) {
      console.error('❌ Error desconectando:', error.message);
    }
  }

  // Enviar comando al Arduino (si necesitas enviar algo)
  sendCommand(command) {
    if (this.isPortConnected()) {
      this.port.write(command + '\n');
      console.log(`📤 Comando enviado: ${command}`);
    } else {
      console.log('❌ No hay conexión para enviar comando');
    }
  }

  // Obtener lista de puertos para API
  async getPortsList() {
    try {
      const ports = await SerialPort.list();
      return ports.map(port => ({
        path: port.path,
        manufacturer: port.manufacturer || 'Desconocido',
        vendorId: port.vendorId || null,
        productId: port.productId || null,
        isArduinoLike: this.isArduinoLikePort(port)
      }));
    } catch (error) {
      console.error('❌ Error obteniendo lista de puertos:', error.message);
      return [];
    }
  }

  // Verificar si un puerto parece ser Arduino
  isArduinoLikePort(port) {
    const manufacturer = (port.manufacturer || '').toLowerCase();
    const vendorId = (port.vendorId || '').toLowerCase();
    
    return manufacturer.includes('arduino') || 
           manufacturer.includes('ch340') ||
           manufacturer.includes('ftdi') ||
           manufacturer.includes('silicon') ||
           vendorId === '2341' || // Arduino oficial
           vendorId === '1a86' || // CH340
           port.path.includes('ttyUSB') ||
           port.path.includes('ttyACM') ||
           port.path.includes('COM');
  }
}

module.exports = ArduinoSerialConnection;