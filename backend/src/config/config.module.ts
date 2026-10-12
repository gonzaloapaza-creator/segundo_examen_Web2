import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_CONFIG, AppConfig, buildConfig } from './configuration';
import { validateEnv } from './env.validation';

/**
 * Carga variables de entorno (archivo .env en desarrollo, entorno real en Docker),
 * las valida con class-validator y expone un objeto de configuracion tipado.
 */
@Global()
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv })],
  providers: [{ provide: APP_CONFIG, useFactory: (): AppConfig => buildConfig(validateEnv(process.env)) }],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
