module.exports = (schema) => (req, _res, next) => {
  req.body = schema.parse(req.body); // ZodError is converted to a 400 by the error handler
  next();
};
