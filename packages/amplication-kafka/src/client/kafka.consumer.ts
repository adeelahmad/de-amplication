import {Consumer, EachMessagePayload, IHeaders} from "kafkajs";
import {KAFKA_KEY_SERIALIZER, KAFKA_VALUE_SERIALIZER, Serializer} from "./types/serializer";
import {KafkaConsumerConfigDto} from "./dtos/kafka-consumer-config.dto";
import {BeforeApplicationShutdown, Inject, Injectable, OnApplicationBootstrap} from "@nestjs/common";
import {Logger} from "winston";
import {KafkaConsumerCallback} from "./types/kafka-consumer-callback.type";
import {KafkaMessageDto} from "./dtos/kafka-message-dto";
import {KafkaClient} from "./kafka-client";

@Injectable()
export class KafkaConsumer<K,V> implements OnApplicationBootstrap, BeforeApplicationShutdown {
    private subscribers: Map<string, KafkaConsumerCallback<K, V>[]>
    private consumer: Consumer;

    constructor(kafkaClient: KafkaClient,
                private config: KafkaConsumerConfigDto,
                @Inject(KAFKA_KEY_SERIALIZER) private keySerialize: Serializer<K>,
                @Inject(KAFKA_VALUE_SERIALIZER) private valueSerialize: Serializer<V>,
                private logger: Logger) {

        this.subscribers = new Map<string, ((kafkaMessage: KafkaMessageDto<K, V>) => Promise<void>)[]>()

        this.consumer = kafkaClient.kafka.consumer({
            groupId: config.groupId,
        })
    }

    private async eachMessage(payload: EachMessagePayload): Promise<void> {
        const key: K = this.keySerialize.deserialize(payload.message.key)
        const value: V = this.valueSerialize.deserialize(payload.message.value)
        const topicConsumers = this.subscribers.get(payload.topic)
        const headers: Map<string, string> = this.convertHeadersIntoMap(payload.message.headers)

        if (topicConsumers) {
            const message = {
                key,
                value,
                partition: payload.partition,
                offset: payload.message.offset,
                topic: payload.topic,
                headers
            }
            await Promise.all(topicConsumers.map(async (callback) => await callback(message)))
        }
    }

    async onApplicationBootstrap(): Promise<any> {

        this.logger.info(`Connecting to kafka:`, {
            ...this.config
        })
        await this.consumer.connect()

        this.logger.info(`Kafka client is connected, subscribing to topics:`, {
            topics: this.subscribers.keys(),
            ...this.config
        })
        for (let topic of this.subscribers.keys()) {
            this.logger.info(`Kafka client subscribing to topic`, {
                topic,
                ...this.config
            })
            await this.consumer.subscribe({
                topic
            })
        }

        this.logger.info(`Kafka client is starting to consume messages`, {
            topics: this.subscribers.keys(),
            ...this.config
        })
        await this.consumer.run({
            partitionsConsumedConcurrently: this.config.concurencyFactor,
            eachMessage: this.eachMessage
        })
    }

    public async subscribe(topic: string, callback: KafkaConsumerCallback<K, V>) {
        this.logger.debug(`Kafka consumer register a subscriber`,{
            topic,
            ...this.config
        })
        let current = this.subscribers.get(topic)
        if (current) {
            current.push(callback)
        } else {
            current = [callback]
        }
        this.subscribers.set(topic, current)
    }

    async beforeApplicationShutdown(signal?: string): Promise<any> {
        this.logger.warn(`Kafka client received ${signal} exit. disconnecting client...`,this.config)
        await this.consumer.disconnect()
    }

    public pause(topic: string, partition: number, timeout: number = 300) {
        this.consumer.pause([{
            topic,
            partitions: [partition]
        }])
        setTimeout(() => {
            this.consumer.resume([{
                topic,
                partitions: [partition]
            }])
        }, timeout)
    }

    public rollback(kafkaMessage: KafkaMessageDto<K, V>): void {
        return this.consumer.seek({
            topic: kafkaMessage.topic,
            partition: kafkaMessage.partition,
            offset: kafkaMessage.offset,
        })
    }

    public commit(kafkaMessage: KafkaMessageDto<K, V>): Promise<void> {
        return this.consumer.commitOffsets([{
            topic: kafkaMessage.topic,
            partition: kafkaMessage.partition,
            offset: kafkaMessage.offset,
        }])
    }

    private convertHeadersIntoMap(headers: IHeaders | undefined): Map<string, string> {
        return new Map<string, string>(Object.entries(headers || {})
            .filter(([, value]) => value === undefined)
            .map(([key, value]) => [key, value!.toString()]))
    }
}