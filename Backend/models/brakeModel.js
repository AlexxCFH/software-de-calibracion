// Backend/models/brakeModel.js

const brakeSchema = {
  // Datos principales del freno
  value: {
    type: 'number',
    default: 0,
    min: 0,
    max: 1023,
    description: 'Valor mapeado para joystick (0-1023)'
  },
  percentage: {
    type: 'number',
    default: 0,
    min: 0,
    max: 100,
    description: 'Porcentaje de presión del pedal (0-100%)'
  },
  force: {
    type: 'number',
    default: 0.0,
    min: 0,
    description: 'Fuerza aplicada en kilogramos'
  },
  active: {
    type: 'boolean',
    default: false,
    description: 'Estado de activación del pedal'
  },
  rawReading: {
    type: 'number',
    default: 0,
    description: 'Lectura cruda del sensor HX711'
  },
  
  // Configuración del freno
  maxForce: {
    type: 'number',
    default: 5.0,
    min: 0.1,
    max: 50,
    description: 'Fuerza máxima esperada en kg'
  },
  deadZone: {
    type: 'number',
    default: 1.0,
    min: 0,
    description: 'Zona muerta en kg'
  },
  
  // Metadatos
  timestamp: {
    type: 'number',
    default: () => Date.now(),
    description: 'Timestamp de la última actualización'
  },
  sensorType: {
    type: 'string',
    default: 'HX711',
    description: 'Tipo de sensor utilizado'
  }
};

// Función para crear una instancia del esquema con valores por defecto
function createBrakeData(initialData = {}) {
  const brakeData = {};
  
  // Aplicar valores por defecto del esquema
  Object.keys(brakeSchema).forEach(key => {
    const field = brakeSchema[key];
    if (typeof field.default === 'function') {
      brakeData[key] = field.default();
    } else {
      brakeData[key] = field.default;
    }
  });
  
  // Sobrescribir con datos iniciales si se proporcionan
  Object.assign(brakeData, initialData);
  
  return brakeData;
}

// Función para validar datos según el esquema
function validateBrakeData(data) {
  const errors = [];
  
  Object.keys(brakeSchema).forEach(key => {
    const field = brakeSchema[key];
    const value = data[key];
    
    // Validar tipo
    if (value !== undefined && typeof value !== field.type) {
      errors.push(`${key}: expected ${field.type}, got ${typeof value}`);
    }
    
    // Validar rango para números
    if (field.type === 'number' && value !== undefined) {
      if (field.min !== undefined && value < field.min) {
        errors.push(`${key}: value ${value} is below minimum ${field.min}`);
      }
      if (field.max !== undefined && value > field.max) {
        errors.push(`${key}: value ${value} is above maximum ${field.max}`);
      }
    }
  });
  
  return {
    isValid: errors.length === 0,
    errors: errors
  };
}

// Función para actualizar datos del freno
function updateBrakeData(currentData, newReading) {
  // Crear copia de los datos actuales
  const updatedData = { ...currentData };
  
  // Actualizar lectura cruda
  updatedData.rawReading = newReading;
  
  // Calcular fuerza (conversión básica)
  let calculatedForce = Math.abs(newReading / 1000000);
  
  // Aplicar zona muerta
  if (calculatedForce < updatedData.deadZone) {
    updatedData.force = 0;
    updatedData.active = false;
  } else {
    updatedData.force = calculatedForce - updatedData.deadZone;
    updatedData.active = true;
  }
  
  // Limitar a fuerza máxima
  updatedData.force = Math.min(updatedData.force, updatedData.maxForce);
  
  // Calcular valor del joystick (0-1023)
  if (updatedData.force > 0) {
    updatedData.value = Math.round((updatedData.force / updatedData.maxForce) * 1023);
  } else {
    updatedData.value = 0;
  }
  
  // Calcular porcentaje
  updatedData.percentage = Math.round((updatedData.value / 1023) * 100);
  
  // Actualizar timestamp
  updatedData.timestamp = Date.now();
  
  return updatedData;
}

// Función para obtener solo los datos de telemetría (sin configuración)
function getBrakeTelemetryData(data) {
  return {
    value: data.value,
    percentage: data.percentage,
    force: parseFloat(data.force.toFixed(2)),
    active: data.active,
    timestamp: data.timestamp
  };
}

module.exports = {
  brakeSchema,
  createBrakeData,
  validateBrakeData,
  updateBrakeData,
  getBrakeTelemetryData
};