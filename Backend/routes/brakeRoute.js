// Backend/routes/brakeRoute.js
const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const brakeController = require('../controllers/brakeController');

// ====================================================================================================================
// RUTAS DE DATOS DEL FRENO
// ====================================================================================================================

// GET /api/brake - Obtener datos actuales del freno (solo telemetría)
router.get('/', asyncHandler(async (req, res) => {
  await brakeController.getBrakeData(req, res);
}));

// GET /api/brake/full - Obtener datos completos del freno (incluyendo configuración)
router.get('/full', asyncHandler(async (req, res) => {
  await brakeController.getFullBrakeData(req, res);
}));

// GET /api/brake/pedals - Obtener datos de todos los pedales (solo con Arduino)
router.get('/pedals', asyncHandler(async (req, res) => {
  await brakeController.getAllPedalsData(req, res);
}));

// GET /api/brake/stream - Stream de datos en tiempo real (Server-Sent Events)
router.get('/stream', (req, res) => {
  brakeController.streamBrakeData(req, res);
});

// GET /api/brake/health - Obtener estado de salud del freno
router.get('/health', asyncHandler(async (req, res) => {
  await brakeController.getBrakeHealth(req, res);
}));

// ====================================================================================================================
// RUTAS DE CONEXIÓN Y ARDUINO
// ====================================================================================================================

// POST /api/brake/connect - Conectar a un puerto específico
router.post('/connect', asyncHandler(async (req, res) => {
  try {
    const { port, baudRate = 9600 } = req.body;
    
    if (!port) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere especificar el puerto'
      });
    }

    // Desconectar si ya hay una conexión
    if (brakeController.arduino.isPortConnected()) {
      brakeController.arduino.disconnect();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Detener simulación si está activa
    if (brakeController.isSimulating) {
      brakeController.isSimulating = false;
      if (brakeController.simulationInterval) {
        clearInterval(brakeController.simulationInterval);
        brakeController.simulationInterval = null;
      }
    }

    // Conectar al puerto especificado
    const connected = await brakeController.arduino.connectToPort(port, baudRate);
    brakeController.isArduinoConnected = connected;

    if (connected) {
      res.json({
        success: true,
        message: `Conectado exitosamente al puerto ${port}`,
        data: {
          port: port,
          baudRate: baudRate,
          isConnected: true
        }
      });
    } else {
      res.status(500).json({
        success: false,
        error: `No se pudo conectar al puerto ${port}`,
        data: {
          port: port,
          isConnected: false
        }
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error conectando al puerto especificado',
      details: error.message
    });
  }
}));

// POST /api/brake/disconnect - Desconectar Arduino
router.post('/disconnect', asyncHandler(async (req, res) => {
  try {
    if (brakeController.arduino.isPortConnected()) {
      brakeController.arduino.disconnect();
      brakeController.isArduinoConnected = false;
      
      // Iniciar simulación como fallback
      await brakeController.startSimulation();
      
      res.json({
        success: true,
        message: 'Arduino desconectado - Modo simulación activado',
        data: {
          isArduinoConnected: false,
          isSimulating: true
        }
      });
    } else {
      res.json({
        success: true,
        message: 'No había conexión activa',
        data: {
          isArduinoConnected: false,
          isSimulating: brakeController.isSimulating
        }
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error desconectando Arduino',
      details: error.message
    });
  }
}));

// GET /api/brake/ports - Obtener información de puertos serie disponibles
router.get('/ports', asyncHandler(async (req, res) => {
  try {
    const ports = await brakeController.arduino.getPortsList();
    
    res.json({
      success: true,
      data: {
        ports: ports,
        total: ports.length,
        arduinoLikePorts: ports.filter(p => p.isArduinoLike).length,
        currentConnection: {
          isConnected: brakeController.isArduinoConnected,
          isPortOpen: brakeController.arduino.isPortConnected()
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
}));

// GET /api/brake/connection - Estado de conexión detallado
router.get('/connection', asyncHandler(async (req, res) => {
  try {
    const currentData = brakeController.getAllCurrentData();
    
    res.json({
      success: true,
      data: {
        isArduinoConnected: brakeController.isArduinoConnected,
        isSimulating: brakeController.isSimulating,
        connectionStatus: brakeController.arduino?.isPortConnected() ? 'connected' : 'disconnected',
        dataSource: brakeController.isArduinoConnected ? 'arduino' : 'simulation',
        lastDataUpdate: currentData.timestamp || Date.now(),
        hasArduinoData: !!brakeController.fullPedalData
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error obteniendo estado de conexión',
      details: error.message
    });
  }
}));

// ====================================================================================================================
// RUTAS DE CONTROL Y CONFIGURACIÓN
// ====================================================================================================================

// PUT /api/brake/update - Actualizar datos del freno manualmente (solo en simulación)
router.put('/update', asyncHandler(async (req, res) => {
  await brakeController.updateBrake(req, res);
}));

// PUT /api/brake/config - Configurar parámetros del freno
router.put('/config', asyncHandler(async (req, res) => {
  await brakeController.configureBrake(req, res);
}));

// POST /api/brake/reset - Resetear datos del freno
router.post('/reset', asyncHandler(async (req, res) => {
  await brakeController.resetBrake(req, res);
}));

// ====================================================================================================================
// RUTAS DE SIMULACIÓN
// ====================================================================================================================

// POST /api/brake/simulation/start - Iniciar simulación (solo si Arduino no está conectado)
router.post('/simulation/start', asyncHandler(async (req, res) => {
  await brakeController.startSimulation(req, res);
}));

// POST /api/brake/simulation/stop - Detener simulación
router.post('/simulation/stop', asyncHandler(async (req, res) => {
  await brakeController.stopSimulation(req, res);
}));

// ====================================================================================================================
// MIDDLEWARE DE VALIDACIÓN
// ====================================================================================================================

// Middleware para validar parámetros de configuración
const validateConfigParams = (req, res, next) => {
  const { maxForce, deadZone } = req.body;
  
  if (maxForce !== undefined) {
    if (typeof maxForce !== 'number' || maxForce <= 0 || maxForce > 50) {
      return res.status(400).json({
        success: false,
        error: 'maxForce debe ser un número entre 0.1 y 50 kg'
      });
    }
  }
  
  if (deadZone !== undefined) {
    if (typeof deadZone !== 'number' || deadZone < 0 || deadZone >= 10) {
      return res.status(400).json({
        success: false,
        error: 'deadZone debe ser un número entre 0 y 10 kg'
      });
    }
  }
  
  next();
};

// Aplicar validación a la ruta de configuración
router.put('/config', validateConfigParams);

// ====================================================================================================================
// RUTAS DE UTILIDAD Y TESTING
// ====================================================================================================================

// POST /api/brake/test - Endpoint para pruebas rápidas
router.post('/test', asyncHandler(async (req, res) => {
  try {
    // Solo permitir pruebas en modo simulación
    if (brakeController.isArduinoConnected) {
      return res.status(400).json({
        success: false,
        error: 'Las pruebas manuales no están disponibles con Arduino conectado. Use los controles físicos.'
      });
    }

    const { force } = req.body;
    
    if (typeof force !== 'number' || force < 0 || force > 50) {
      return res.status(400).json({
        success: false,
        error: 'force debe ser un número entre 0 y 50 kg'
      });
    }
    
    // Simular lectura correspondiente a la fuerza especificada
    const simulatedReading = 8388607 + (force * 1000000);
    
    // Actualizar datos
    const updatedData = brakeController.updateInternalData(simulatedReading);
    
    res.json({
      success: true,
      message: `Prueba con fuerza de ${force}kg aplicada (modo simulación)`,
      data: {
        testForce: force,
        simulatedReading: simulatedReading,
        result: updatedData
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error en prueba del freno',
      details: error.message
    });
  }
}));

// GET /api/brake/info - Información sobre el esquema y capacidades
router.get('/info', (req, res) => {
  const isArduinoConnected = brakeController.isArduinoConnected;
  
  res.json({
    success: true,
    data: {
      name: 'Brake Pedal API with Arduino Support',
      version: '2.0.0',
      description: 'API para gestión de datos del pedal de freno con soporte para Arduino',
      currentMode: isArduinoConnected ? 'Arduino Real-Time' : 'Simulation Mode',
      endpoints: {
        // Endpoints principales
        'GET /': 'Obtener datos actuales del freno',
        'GET /full': 'Obtener datos completos incluyendo configuración',
        'GET /pedals': 'Obtener datos de todos los pedales (solo Arduino)',
        'GET /stream': 'Stream de datos en tiempo real',
        'GET /health': 'Estado de salud del freno',
        
        // Conexión y Arduino
        'POST /reconnect': 'Reconectar Arduino manualmente',
        'GET /ports': 'Listar puertos serie disponibles',
        'GET /connection': 'Estado detallado de conexión',
        
        // Configuración
        'PUT /update': 'Actualizar datos manualmente (solo simulación)',
        'PUT /config': 'Configurar parámetros',
        'POST /reset': 'Resetear datos',
        
        // Simulación
        'POST /simulation/start': 'Iniciar simulación',
        'POST /simulation/stop': 'Detener simulación',
        
        // Utilidades
        'POST /test': 'Prueba con fuerza específica (solo simulación)',
        'GET /info': 'Información de la API'
      },
      dataSchema: {
        brake: {
          value: 'number (0-1023) - Valor para joystick',
          percentage: 'number (0-100) - Porcentaje de presión',
          force: 'number (≥0) - Fuerza en kilogramos',
          active: 'boolean - Estado de activación',
          timestamp: 'number - Timestamp de última actualización'
        },
        pedals: isArduinoConnected ? {
          throttle: 'object - Datos del acelerador (solo Arduino)',
          brake: 'object - Datos del freno',
          clutch: 'object - Datos del embrague (solo Arduino)',
          status: 'string - Estado general (ACELERANDO/FRENANDO/EMBRAGUE/LIBERADOS)'
        } : 'Solo disponible con Arduino conectado'
      },
      configSchema: {
        maxForce: 'number (0.1-50) - Fuerza máxima en kg',
        deadZone: 'number (0-10) - Zona muerta en kg'
      },
      features: {
        arduinoSupport: true,
        realTimeData: isArduinoConnected,
        simulationMode: !isArduinoConnected,
        allPedalsData: isArduinoConnected,
        autoReconnection: true,
        terminalDisplay: true
      }
    }
  });
});

// GET /api/brake/debug - Información de debug (solo desarrollo)
router.get('/debug', asyncHandler(async (req, res) => {
  try {
    const debugInfo = {
      controller: {
        isArduinoConnected: brakeController.isArduinoConnected,
        isSimulating: brakeController.isSimulating,
        lastDisplayedPercentage: brakeController.lastDisplayedPercentage
      },
      brakeData: brakeController.brakeData,
      fullPedalData: brakeController.fullPedalData || null,
      arduino: {
        isPortConnected: brakeController.arduino?.isPortConnected() || false,
        connectionAttempts: brakeController.arduino?.connectionAttempts || 0
      },
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        uptime: process.uptime(),
        timestamp: Date.now()
      }
    };
    
    res.json({
      success: true,
      data: debugInfo
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error obteniendo información de debug',
      details: error.message
    });
  }
}));

module.exports = router;