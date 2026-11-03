import { createDataSource } from './data-source.js';

// For the TypeORM CLI only (`npm run migration:generate`). Reads DATABASE_URL from the env.
export default createDataSource(process.env.DATABASE_URL ?? '');
