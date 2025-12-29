// Type stub for optional pg module
declare module 'pg' {
  export class Pool {
    constructor(config?: any);
    query(text: string, values?: any[]): Promise<any>;
    connect(): Promise<any>;
    end(): Promise<void>;
  }
  export class Client {
    constructor(config?: any);
    query(text: string, values?: any[]): Promise<any>;
    connect(): Promise<void>;
    end(): Promise<void>;
  }
}
