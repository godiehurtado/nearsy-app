module.exports = new Proxy(
  {},
  {
    get(_target, prop) {
      const err = new Error(
        `RNFirebase is disabled on iOS build. Attempted to access: ${String(
          prop,
        )}`,
      );
      // Muestra el stack completo para encontrar el import real
      console.error(err.stack);
      throw err;
    },
  },
);
