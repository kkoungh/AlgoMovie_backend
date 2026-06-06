const createMockPool = () => {
  const pool = {
    query: jest.fn(),
    connect: jest.fn(),
  };

  const enqueueQueryRows = (...rowsList) => {
    rowsList.forEach((rows) => {
      pool.query.mockResolvedValueOnce({ rows });
    });
  };

  const createClient = () => ({
    query: jest.fn(),
    release: jest.fn(),
  });

  return { pool, enqueueQueryRows, createClient };
};

module.exports = { createMockPool };
