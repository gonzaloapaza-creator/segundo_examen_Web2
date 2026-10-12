import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_CONFIG, AppConfig } from '../config/configuration';
import { buildDataSourceOptions } from './data-source';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        ...buildDataSourceOptions(config.database),
        autoLoadEntities: true,
        // Las migraciones se ejecutan explicitamente en main.ts para que un fallo detenga el arranque.
        migrationsRun: false,
        retryAttempts: 10,
        retryDelay: 2000,
      }),
    }),
  ],
})
export class DatabaseModule {}
