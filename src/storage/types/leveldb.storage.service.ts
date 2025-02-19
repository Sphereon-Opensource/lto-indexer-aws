import { StorageInterface } from '../interfaces/storage.interface';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '../../config/config.service';
import { LeveldbConnection } from '../../leveldb/classes/leveldb.connection';
import { LeveldbService } from '../../leveldb/leveldb.service';

@Injectable()
export class LeveldbStorageService implements StorageInterface, OnModuleInit, OnModuleDestroy {
  private connection: LeveldbConnection;

  constructor(private readonly config: ConfigService, private readonly leveldb: LeveldbService) {}

  async onModuleInit() {}

  async onModuleDestroy() {
    await this.close();
  }

  private async init() {
    if (!this.connection) {
      this.connection = await this.leveldb.connect(this.config.getLevelDbName());
    }
  }

  private async close() {
    if (this.connection) {
      await this.connection.close();
      delete this.connection;
    }
  }

  async getValue(key: string): Promise<string> {
    await this.init();
    return this.connection.get(key);
  }

  async getMultipleValues(keys: string[]): Promise<string[]> {
    await this.init();
    return this.connection.mget(keys);
  }

  async setValue(key: string, value: string): Promise<void> {
    await this.init();
    await this.connection.set(key, value);
  }

  async delValue(key: string): Promise<void> {
    await this.init();
    await this.connection.del(key);
  }

  async incrValue(key: string): Promise<void> {
    await this.init();
    await this.connection.incr(key);
  }

  async addObject(key: string, value: object): Promise<void> {
    await this.init();
    await this.connection.add(key, JSON.stringify(value));
  }

  async setObject(key: string, value: object): Promise<void> {
    return this.setValue(key, JSON.stringify(value));
  }

  async getObject(key: string): Promise<object> {
    const res = await this.getValue(key);
    return res ? JSON.parse(res) : {};
  }

  async sadd(key: string, value: string): Promise<void> {
    // TODO: implement
  }

  async srem(key: string, value: string): Promise<void> {
    // TODO: implement
  }

  async getArray<T>(key: string): Promise<T[]> {
    // TODO: implement
    return [];
  }

  async countTx(type: string, address: string): Promise<number> {
    await this.init();
    return this.connection.countTx(`lto:tx:${type}:${address}`);
  }

  async getTx(type: string, address: string, limit: number, offset: number): Promise<string[]> {
    await this.init();
    return this.connection.paginate(`lto:tx:${type}:${address}`, limit, offset);
  }

  async indexTx(type: string, address: string, transactionId: string, timestamp: number): Promise<void> {
    await this.init();
    await this.connection.zaddWithScore(`lto:tx:${type}:${address}`, String(timestamp), transactionId);
  }
}
