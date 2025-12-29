// Type stub for optional ioredis module
declare module 'ioredis' {
  export default class Redis {
    constructor(config?: any);
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ...args: any[]): Promise<string>;
    del(key: string): Promise<number>;
    keys(pattern: string): Promise<string[]>;
    expire(key: string, seconds: number): Promise<number>;
    quit(): Promise<string>;
    status: string;
  }
}
