import { Global, Module } from '@nestjs/common';
import { KafkaProducerService } from '@/kafka/kafka-producer.service';

@Global()
@Module({
    providers: [KafkaProducerService],
    exports: [KafkaProducerService],
})
export class KafkaModule {}
