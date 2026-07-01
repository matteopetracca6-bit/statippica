// Storage interface not used — all queries are inline in routes.ts via raw SQLite.
export interface IStorage {}
export class Storage implements IStorage {}
export const storage = new Storage();
