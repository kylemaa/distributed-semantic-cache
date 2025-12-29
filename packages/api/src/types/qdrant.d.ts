// Type stub for optional @qdrant/js-client-rest module
declare module '@qdrant/js-client-rest' {
  export class QdrantClient {
    constructor(config?: { url?: string; apiKey?: string });
    getCollections(): Promise<{ collections: Array<{ name: string }> }>;
    createCollection(name: string, config: any): Promise<void>;
    upsert(collection: string, config: any): Promise<void>;
    search(collection: string, config: any): Promise<Array<{ id: string | number; score: number }>>;
    delete(collection: string, config: any): Promise<void>;
    scroll(collection: string, config: any): Promise<{ points: Array<{ id: string | number }> }>;
  }
}
