// Backend/controllers/brakeController.js
const { 
  createBrakeData, 
  updateBrakeData, 
  validateBrakeData, 
  getBrakeTelemetryData 
} = require('../models/brakeModel');

class BrakeController {
  constructor() {
    // Inicializar datos del freno
    this.brakeData = createBrakeData();
    this.isSimulating = false;
    this.simulationInterval = null;
    
    // Iniciar simulación automática para pruebas
    this.startSimulation();
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

      // Actualizar datos
      this.brakeData = updateBrakeData(this.brakeData, rawReading);
      
      // Validar datos actualizados
      const validation = validateBrakeData(this.brakeData);
      
      res.json({
        success: true,
        message: 'Datos del freno actualizados',
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
      
      // Validar y actualizar configuración
      if (maxForce !== undefined) {
        if (typeof maxForce !== 'number' || maxForce <= 0) {
          return res.status(400).json({
            success: false,
            error: 'maxForce debe ser un número positivo'
          });
        }
        this.brakeData.maxForce = maxForce;
      }
      
      if (deadZone !== undefined) {
        if (typeof deadZone !== 'number' || deadZone < 0) {
          return res.status(400).json({
            success: false,
            error: 'deadZone debe ser un número no negativo'
          });
        }
        this.brakeData.deadZone = deadZone;
      }
      
      // Actualizar timestamp
      this.brakeData.timestamp = Date.now();
      
      // Validar configuración
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
      // Mantener configuración actual
      const currentConfig = {
        maxForce: this.brakeData.maxForce,
        deadZone: this.brakeData.deadZone
      };
      
      // Crear nuevos datos con configuración preservada
      this.brakeData = createBrakeData(currentConfig);
      
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

  // Iniciar simulación
  async startSimulation(req = null, res = null) {
    try {
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
      
      // Generar datos simulados cada 100ms
      this.simulationInterval = setInterval(() => {
        // Generar lectura simulada del HX711
        const baseReading = 8388607; // Valor típico del HX711
        const forceVariation = Math.sin(Date.now() / 1000) * 2000000; // Variación sinusoidal
        const noise = (Math.random() - 0.5) * 100000; // Ruido aleatorio
        
        const simulatedReading = baseReading + forceVariation + noise;
        
        // Actualizar datos
        this.brakeData = updateBrakeData(this.brakeData, simulatedReading);
      }, 100);

      if (res) {
        res.json({
          success: true,
          message: 'Simulación del freno iniciada',
          data: {
            isSimulating: this.isSimulating,
            interval: 100 // ms
          }
        });
      }
    } catch (error) {
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

    // Enviar datos cada 50ms (20Hz)
    const streamInterval = setInterval(() => {
      if (req.connection.destroyed) {
        clearInterval(streamInterval);
        return;
      }
      
      try {
        const telemetryData = getBrakeTelemetryData(this.brakeData);
        res.write(`data: ${JSON.stringify({
          brake: telemetryData,
          isSimulating: this.isSimulating
        })}\n\n`);
      } catch (error) {
        console.error('Error en stream del freno:', error);
      }
    }, 50);

    req.on('close', () => {
      clearInterval(streamInterval);
    });
  }

  // Obtener estado de salud del freno
  async getBrakeHealth(req, res) {
    try {
      const validation = validateBrakeData(this.brakeData);
      const telemetryData = getBrakeTelemetryData(this.brakeData);
      
      const health = {
        operational: validation.isValid,
        active: this.brakeData.active,
        currentForce: this.brakeData.force,
        currentValue: this.brakeData.value,
        lastUpdate: this.brakeData.timestamp,
        isSimulating: this.isSimulating,
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

  // Método para obtener datos internamente (para otros controladores)
  getCurrentData() {
    return getBrakeTelemetryData(this.brakeData);
  }

  // Método para actualizar datos internamente
  updateInternalData(rawReading) {
    this.brakeData = updateBrakeData(this.brakeData, rawReading);
    return this.getCurrentData();
  }
}

// Crear instancia singleton
const brakeController = new BrakeController();

module.exports = brakeController;