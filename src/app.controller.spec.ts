import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

describe('AppController', () => {
  it('devuelve { status: "ok" } cuando PostgreSQL responde SELECT 1', async () => {
    const mockDataSource = {
      query: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    const appController = app.get<AppController>(AppController);
    await expect(appController.getHealth()).resolves.toEqual({ status: 'ok' });
    expect(mockDataSource.query).toHaveBeenCalledWith('SELECT 1');
  });

  it('lanza ServiceUnavailableException cuando la BD falla', async () => {
    const mockDataSource = {
      query: vi.fn().mockRejectedValue(new Error('connection refused')),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    const appController = app.get<AppController>(AppController);
    await expect(appController.getHealth()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
