const validateRequest = (schema) => async (req, res, next) => {
  try {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map((d) => ({
        field: d.path.join('.'),
        message: d.message,
      }));
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        errors,
      });
    }

    req.body = value;
    next();
  } catch (err) {
    console.error('[Validator] Error:', err.message);
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: err.message,
    });
  }
};

module.exports = { validateRequest };
