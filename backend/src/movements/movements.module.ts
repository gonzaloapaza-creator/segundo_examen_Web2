import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsModule } from '../products/products.module';
import { IdempotencyRecord } from './entities/idempotency-record.entity';
import { Movement } from './entities/movement.entity';
import { IdempotencyService } from './idempotency/idempotency.service';
import { MovementsController } from './movements.controller';
import { MovementsRepository } from './movements.repository';
import { MovementsService } from './movements.service';

@Module({
  imports: [TypeOrmModule.forFeature([Movement, IdempotencyRecord]), ProductsModule],
  controllers: [MovementsController],
  providers: [MovementsService, MovementsRepository, IdempotencyService],
  exports: [MovementsService, MovementsRepository],
})
export class MovementsModule {}
