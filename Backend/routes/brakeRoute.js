// Backend/routes/brakeRoutes.js
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

// GET /api/brake/stream - Stream de datos en tiempo real (Server-Sent Events)
router.get('/stream', (req, res) => {
  brakeController.streamBrakeData(req, res);
});

// GET /api/brake/health - Obtener estado de salud del freno
router.get('/health', asyncHandler(async (req, res) => {
  await brakeController.getBrakeHealth(req, res);
}));

// ====================================================================================================================
// RUTAS DE CONTROL Y CONFIGURACIÓN
// ====================================================================================================================

// PUT /api/brake/update - Actualizar datos del freno manualmente (para testing)
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

// POST /api/brake/simulation/start - Iniciar simulación
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
      message: `Prueba con fuerza de ${force}kg aplicada`,
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
  res.json({
    success: true,
    data: {
      name: 'Brake Pedal API',
      version: '1.0.0',
      description: 'API para gestión de datos del pedal de freno',
      endpoints: {
        'GET /': 'Obtener datos actuales del freno',
        'GET /full': 'Obtener datos completos incluyendo configuración',
        'GET /stream': 'Stream de datos en tiempo real',
        'GET /health': 'Estado de salud del freno',
        'PUT /update': 'Actualizar datos manualmente',
        'PUT /config': 'Configurar parámetros',
        'POST /reset': 'Resetear datos',
        'POST /simulation/start': 'Iniciar simulación',
        'POST /simulation/stop': 'Detener simulación',
        'POST /test': 'Prueba con fuerza específica',
        'GET /info': 'Información de la API'
      },
      dataSchema: {
        value: 'number (0-1023) - Valor para joystick',
        percentage: 'number (0-100) - Porcentaje de presión',
        force: 'number (≥0) - Fuerza en kilogramos',
        active: 'boolean - Estado de activación',
        timestamp: 'number - Timestamp de última actualización'
      },
      configSchema: {
        maxForce: 'number (0.1-50) - Fuerza máxima en kg',
        deadZone: 'number (0-10) - Zona muerta en kg'
      }
    }
  });
});

module.exports = router;