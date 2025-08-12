// Backend/controllers/brakeController.js
const { 
  createBrakeData, 
  updateBrakeData, 
  validateBrakeData, 
  getBrakeTelemetryData 
} = require('../models/brakeModel');
const ArduinoSerialConnection = require('../services/serialConnection');

class BrakeController {
  constructor() {
    // Inicializar datos del freno
    this.brakeData = createBrakeData();
    this.isSimulating = false;
    this.simulationInterval = null;
    this.lastDisplayedPercentage = -1;
    
    // Inicializar conexión con Arduino
    this.arduino = new ArduinoSerialConnection();
    this.isArduinoConnected = false;
    
    // Configurar callback para datos del Arduino
    this.arduino.onDataReceived((data) => {
      this.processArduinoData(data);
    });
    
    // Intentar conectar al Arduino
    this.connectToArduino();
    
    console.log('\n🚗 Sistema de Pedales Iniciado');
    console.log('═══════════════════════════════════════════════');
    console.log('📡 Buscando Arduino...');
    console.log('═══════════════════════════════════════════════\n');
  }

  // Conectar al Arduino
  async connectToArduino() {
    try {
      console.log('📡 Buscando Arduino...');
      
      // Usar conexión interactiva que permite seleccionar puerto
      const connected = await this.arduino.connectInteractive();
      this.isArduinoConnected = connected;
      
      if (connected) {
        console.log('✅ Arduino conectado - Datos en tiempo real activados');
        console.log('📊 Monitor de Pedales en Tiempo Real');
        console.log('═══════════════════════════════════════════════\n');
      } else {
        console.log('🎮 Modo simulación activado');
        console.log('═══════════════════════════════════════════════');
        this.startSimulation();
      }
    } catch (error) {
      console.error('❌ Error conectando Arduino:', error.message);
      console.log('🎮 Iniciando modo simulación como respaldo...');
      this.startSimulation();
    }
  }

  // Procesar datos recibidos del Arduino
  processArduinoData(arduinoData) {
    try {
      // Actualizar datos del freno con la información del Arduino
      this.brakeData.value = arduinoData.brake.value;
      this.brakeData.percentage = arduinoData.brake.percentage;
      this.brakeData.active = arduinoData.brake.active;
      
      // Calcular fuerza aproximada basada en el porcentaje
      this.brakeData.force = (arduinoData.brake.percentage / 100) * this.brakeData.maxForce;
      
      // Simular lectura cruda proporcional
      this.brakeData.rawReading = 8388607 + (this.brakeData.force * 1000000);
      
      // Actualizar timestamp
      this.brakeData.timestamp = Date.now();

      // Datos adicionales del sistema completo
      this.fullPedalData = {
        brake: {
          value: arduinoData.brake.value,
          percentage: arduinoData.brake.percentage,
          active: arduinoData.brake.active,
          force: this.brakeData.force
        },
        throttle: {
          value: arduinoData.throttle.value,
          percentage: arduinoData.throttle.percentage,
          active: arduinoData.throttle.active
        },
        clutch: {
          value: arduinoData.clutch.value,
          percentage: arduinoData.clutch.percentage,
          active: arduinoData.clutch.active
        },
        status: arduinoData.status,
        timestamp: Date.now(),
        source: 'arduino'
      };

    } catch (error) {
      console.error('❌ Error procesando datos del Arduino:', error.message);
    }
  }

  // Función para mostrar barra de progreso del freno solamente
  displayBrakePercentage(percentage, force) {
    // Solo actualizar si hay cambio significativo
    if (Math.abs(percentage - this.lastDisplayedPercentage) < 2) return;
    
    this.lastDisplayedPercentage = percentage;
    
    // Crear barra de progreso visual
    const barLength = 30;
    const filledLength = Math.round((percentage / 100) * barLength);
    const emptyLength = barLength - filledLength;
    
    const filledBar = '█'.repeat(filledLength);
    const emptyBar = '░'.repeat(emptyLength);
    const progressBar = filledBar + emptyBar;
    
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
    
    // Determinar color basado en el porcentaje
    let color = colors.green;
    let status = '🟢 SUAVE';
    
    if (percentage > 25 && percentage <= 50) {
      color = colors.yellow;
      status = '🟡 MEDIO';
    } else if (percentage > 50 && percentage <= 75) {
      color = colors.red;
      status = '🟠 FUERTE';
    } else if (percentage > 75) {
      color = colors.red;
      status = '🔴 MÁXIMO';
    }
    
    // Solo mostrar cuando hay frenado activo
    if (percentage > 0) {
      console.log(`\n${colors.bold}🛑 FRENO: ${color}${percentage.toFixed(1)}%${colors.reset} ` +
                 `${colors.cyan}[${progressBar}]${colors.reset} ` +
                 `${colors.blue}💪 ${force.toFixed(2)}kg${colors.reset} ${status}`);
    }
  }

  // Obtener datos actuales del freno
  async getBrakeData(req, res) {
    try {
      const telemetryData = getBrakeTelemetryData(this.brakeData);
      
      res.json({
        success: true,
        data: {
          brake: telemetryData,
          isSimulating: this.isSimulating,
          isArduinoConnected: this.isArduinoConnected,
          source: this.isArduinoConnected ? 'arduino' : 'simulation',
          timestamp: Date.now()
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Error obteniendo datos del freno',
        details: error.message
      });
    }
  }

  // Obtener datos completos de todos los pedales (solo disponible con Arduino)
  async getAllPedalsData(req, res) {
    try {
      if (!this.isArduinoConnected) {
        return res.status(503).json({
          success: false,
          error: 'Arduino no conectado - Solo datos del freno disponibles en modo simulación'
        });
      }

      res.json({
        success: true,
        data: {
          pedals: this.fullPedalData || this.arduino.getCurrentData(),
          brake: getBrakeTelemetryData(this.brakeData),
          isArduinoConnected: this.isArduinoConnected,
          timestamp: Date.now()
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Error obteniendo datos de todos los pedales',
        details: error.message
      });
    }
  }

  // Obtener datos completos (incluyendo configuración)
  async getFullBrakeData(req, res) {
    try {
      const validation = validateBrakeData(this.brakeData);
      
      res.json({
        success: true,
        data: {
          brake: this.brakeData,
          validation: validation,
          isSimulating: this.isSimulating,
          isArduinoConnected: this.isArduinoConnected,
          connectionStatus: this.arduino.isPortConnected() ? 'connected' : 'disconnected',
          timestamp: Date.now()
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Error obteniendo datos completos del freno',
        details: error.message
      });
    }
  }

  // Actualizar datos del freno manualmente (para testing)
  async updateBrake(req, res) {
    try {
      const { rawReading } = req.body;
      
      if (typeof rawReading !== 'number') {
        return res.status(400).json({
          success: false,
          error: 'rawReading debe ser un número'
        });
      }

      // Solo permitir actualizaciones manuales en modo simulación
      if (this.isArduinoConnected) {
        return res.status(400).json({
          success: false,
          error: 'No se pueden hacer actualizaciones manuales con Arduino conectado'
        });
      }

      // Actualizar datos
      this.brakeData = updateBrakeData(this.brakeData, rawReading);
      
      // Mostrar en terminal
      this.displayBrakePercentage(this.brakeData.percentage, this.brakeData.force);
      
      // Validar datos actualizados
      const validation = validateBrakeData(this.brakeData);
      
      res.json({
        success: true,
        message: 'Datos del freno actualizados manualmente',
        data: {
          brake: getBrakeTelemetryData(this.brakeData),
          validation: validation
        }
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Error actualizando datos del freno',
        details: error.message
      });
    }
  }

  // Configurar parámetros del freno
  async configureBrake(req, res) {
    try {
      const { maxForce, deadZone } = req.body;
      
      if (maxForce !== undefined) {
        if (typeof maxForce !== 'number' || maxForce <= 0) {
          return res.status(400).json({
            success: false,
            error: 'maxForce debe ser un número positivo'
          });
        }
        this.brakeData.maxForce = maxForce;
        console.log(`\n🔧 Fuerza máxima actualizada: ${maxForce} kg`);
      }
      
      if (deadZone !== undefined) {
        if (typeof deadZone !== 'number' || deadZone < 0) {
          return res.status(400).json({
            success: false,
            error: 'deadZone debe ser un número no negativo'
          });
        }
        this.brakeData.deadZone = deadZone;
        console.log(`\n🚫 Zona muerta actualizada: ${deadZone} kg`);
      }
      
      this.brakeData.timestamp = Date.now();
      const validation = validateBrakeData(this.brakeData);
      
      res.json({
        success: true,
        message: 'Configuración del freno actualizada',
        data: {
          configuration: {
            maxForce: this.brakeData.maxForce,
            deadZone: this.brakeData.deadZone
          },
          validation: validation
        }
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Error configurando freno',
        details: error.message
      });
    }
  }

  // Resetear datos del freno
  async resetBrake(req, res) {
    try {
      const currentConfig = {
        maxForce: this.brakeData.maxForce,
        deadZone: this.brakeData.deadZone
      };
      
      this.brakeData = createBrakeData(currentConfig);
      console.log('\n🔄 Datos del freno reseteados');
      
      res.json({
        success: true,
        message: 'Datos del freno reseteados',
        data: {
          brake: getBrakeTelemetryData(this.brakeData)
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Error reseteando freno',
        details: error.message
      });
    }
  }

  // Iniciar simulación (solo si Arduino no está conectado)
  async startSimulation(req = null, res = null) {
    try {
      if (this.isArduinoConnected) {
        const message = 'Arduino conectado - La simulación no es necesaria';
        if (res) {
          return res.status(400).json({
            success: false,
            error: message
          });
        }
        console.log(`⚠️ ${message}`);
        return;
      }

      if (this.isSimulating) {
        if (res) {
          return res.status(400).json({
            success: false,
            error: 'La simulación ya está activa'
          });
        }
        return;
      }

      this.isSimulating = true;
      console.log('\n🎮 Simulación iniciada (Arduino no detectado)');
      
      this.simulationInterval = setInterval(() => {
        const baseReading = 8388607;
        const forceVariation = Math.sin(Date.now() / 3000) * 2500000;
        const noise = (Math.random() - 0.5) * 100000;
        
        const simulatedReading = baseReading + Math.max(0, forceVariation) + noise;
        this.brakeData = updateBrakeData(this.brakeData, simulatedReading);
        
        // Mostrar datos simulados ocasionalmente
        if (this.brakeData.percentage > 5) {
          this.displayBrakePercentage(this.brakeData.percentage, this.brakeData.force);
        }
      }, 150);

      if (res) {
        res.json({
          success: true,
          message: 'Simulación del freno iniciada',
          data: {
            isSimulating: this.isSimulating,
            reason: 'Arduino no conectado'
          }
        });
      }
    } catch (error) {
      console.error('❌ Error iniciando simulación:', error.message);
      if (res) {
        res.status(500).json({
          success: false,
          error: 'Error iniciando simulación',
          details: error.message
        });
      }
    }
  }

  // Detener simulación
  async stopSimulation(req, res) {
    try {
      if (!this.isSimulating) {
        return res.status(400).json({
          success: false,
          error: 'La simulación no está activa'
        });
      }

      this.isSimulating = false;
      
      if (this.simulationInterval) {
        clearInterval(this.simulationInterval);
        this.simulationInterval = null;
      }

      console.log('\n🛑 Simulación detenida');

      res.json({
        success: true,
        message: 'Simulación del freno detenida',
        data: {
          isSimulating: this.isSimulating
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Error deteniendo simulación',
        details: error.message
      });
    }
  }

  // Stream de datos en tiempo real
  streamBrakeData(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    const streamInterval = setInterval(() => {
      if (req.connection.destroyed) {
        clearInterval(streamInterval);
        return;
      }
      
      try {
        const telemetryData = getBrakeTelemetryData(this.brakeData);
        const streamData = {
          brake: telemetryData,
          isSimulating: this.isSimulating,
          isArduinoConnected: this.isArduinoConnected,
          source: this.isArduinoConnected ? 'arduino' : 'simulation'
        };

        // Incluir datos de todos los pedales si está disponible
        if (this.isArduinoConnected && this.fullPedalData) {
          streamData.allPedals = this.fullPedalData;
        }

        res.write(`data: ${JSON.stringify(streamData)}\n\n`);
      } catch (error) {
        console.error('❌ Error en stream:', error);
      }
    }, 50);

    req.on('close', () => {
      clearInterval(streamInterval);
    });
  }

  // Obtener estado de salud del sistema
  async getBrakeHealth(req, res) {
    try {
      const validation = validateBrakeData(this.brakeData);
      
      const health = {
        operational: validation.isValid,
        active: this.brakeData.active,
        currentForce: this.brakeData.force,
        currentValue: this.brakeData.value,
        lastUpdate: this.brakeData.timestamp,
        isSimulating: this.isSimulating,
        isArduinoConnected: this.isArduinoConnected,
        connectionStatus: this.arduino.isPortConnected() ? 'connected' : 'disconnected',
        dataSource: this.isArduinoConnected ? 'arduino' : 'simulation',
        validation: validation,
        uptime: Date.now() - this.brakeData.timestamp
      };
      
      res.json({
        success: true,
        data: health
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Error obteniendo estado de salud del freno',
        details: error.message
      });
    }
  }

  // Reconectar Arduino manualmente
  async reconnectArduino(req, res) {
    try {
      console.log('\n🔄 Reintentando conexión con Arduino...');
      
      // Desconectar si está conectado
      if (this.arduino.isPortConnected()) {
        this.arduino.disconnect();
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Detener simulación si está activa
      if (this.isSimulating) {
        this.isSimulating = false;
        if (this.simulationInterval) {
          clearInterval(this.simulationInterval);
          this.simulationInterval = null;
        }
      }

      // Intentar reconectar
      const connected = await this.arduino.connect();
      this.isArduinoConnected = connected;

      if (connected) {
        res.json({
          success: true,
          message: 'Arduino reconectado exitosamente',
          data: {
            isArduinoConnected: true,
            connectionStatus: 'connected'
          }
        });
      } else {
        // Si falla, volver a simulación
        console.log('⚠️ Reconexión fallida - Volviendo a modo simulación');
        await this.startSimulation();
        
        res.json({
          success: false,
          message: 'No se pudo reconectar Arduino - Modo simulación activado',
          data: {
            isArduinoConnected: false,
            isSimulating: true
          }
        });
      }
    } catch (error) {
      console.error('❌ Error en reconexión:', error.message);
      res.status(500).json({
        success: false,
        error: 'Error intentando reconectar Arduino',
        details: error.message
      });
    }
  }

  // Obtener información del puerto serie
  async getSerialPortInfo(req, res) {
    try {
      const ports = await this.arduino.findArduinoPorts();
      
      res.json({
        success: true,
        data: {
          availablePorts: ports,
          currentConnection: {
            isConnected: this.isArduinoConnected,
            isPortOpen: this.arduino.isPortConnected()
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Error obteniendo información de puertos',
        details: error.message
      });
    }
  }

  // Método para obtener datos internamente
  getCurrentData() {
    return getBrakeTelemetryData(this.brakeData);
  }

  // Método para obtener todos los datos de pedales
  getAllCurrentData() {
    if (this.isArduinoConnected && this.fullPedalData) {
      return {
        ...this.fullPedalData,
        brake: getBrakeTelemetryData(this.brakeData)
      };
    }
    return {
      brake: getBrakeTelemetryData(this.brakeData),
      source: 'simulation'
    };
  }

  // Método para actualizar datos internamente (para compatibilidad)
  updateInternalData(rawReading) {
    if (!this.isArduinoConnected) {
      this.brakeData = updateBrakeData(this.brakeData, rawReading);
      this.displayBrakePercentage(this.brakeData.percentage, this.brakeData.force);
    }
    return this.getCurrentData();
  }

  // Método para mostrar estadísticas detalladas
  showDetailedStats() {
    console.log('\n\n📈 ESTADÍSTICAS DETALLADAS DEL SISTEMA');
    console.log('═══════════════════════════════════════════════');
    console.log(`🎯 Estado: ${this.isArduinoConnected ? '✅ Arduino Conectado' : '🎮 Modo Simulación'}`);
    console.log(`📊 Porcentaje Freno: ${this.brakeData.percentage}%`);
    console.log(`💪 Fuerza: ${this.brakeData.force.toFixed(2)} kg`);
    console.log(`⚡ Activo: ${this.brakeData.active ? '✅ SÍ' : '❌ NO'}`);
    
    if (this.isArduinoConnected && this.fullPedalData) {
      console.log(`🚀 Acelerador: ${this.fullPedalData.throttle.percentage}%`);
      console.log(`🔧 Embrague: ${this.fullPedalData.clutch.percentage}%`);
      console.log(`📡 Estado: ${this.fullPedalData.status}`);
    }
    
    console.log(`🔧 Fuerza Máxima: ${this.brakeData.maxForce} kg`);
    console.log(`🚫 Zona Muerta: ${this.brakeData.deadZone} kg`);
    console.log(`🕒 Última Actualización: ${new Date(this.brakeData.timestamp).toLocaleTimeString()}`);
    console.log('═══════════════════════════════════════════════\n');
  }

  // Método de limpieza al cerrar
  cleanup() {
    console.log('\n\n👋 Cerrando sistema de pedales...');
    
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
    
    if (this.arduino && this.arduino.isPortConnected()) {
      this.arduino.disconnect();
    }
    
    console.log('✅ Sistema cerrado correctamente');
  }
}

// Crear instancia singleton
const brakeController = new BrakeController();

// Mostrar estadísticas cada 15 segundos
setInterval(() => {
  if (brakeController.isArduinoConnected || brakeController.isSimulating) {
    brakeController.showDetailedStats();
  }
}, 15000);

// Manejar cierre graceful
process.on('SIGINT', () => {
  brakeController.cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  brakeController.cleanup();
  process.exit(0);
});

module.exports = brakeController;