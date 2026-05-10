import { Controller, Get, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DataSource } from "typeorm";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "../../database/redis/redis.module";

@Controller("health")
export class HealthController {
  constructor(
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  @Get()
  async check() {
    const postgres = this.postgresStatus();
    const redis = await this.redisStatus();
    const keycloakConfigured = Boolean(
      this.config.get<string>("KEYCLOAK_URL") &&
        this.config.get<string>("KEYCLOAK_REALM") &&
        this.config.get<string>("KEYCLOAK_CLIENT_ID"),
    );

    return {
      status:
        postgres.status === "up" && redis.status === "up" && keycloakConfigured
          ? "ok"
          : "degraded",
      service: "auth-service",
      version: this.config.get<string>("APP_VERSION", "1.0.0"),
      environment: this.config.get<string>("NODE_ENV", "development"),
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      checks: {
        http: { status: "ok" },
        postgres,
        redis,
        kafka: {
          status: "configured",
          brokers: this.config
            .get<string>("KAFKA_BROKERS", "localhost:9092")
            .split(",")
            .map((broker) => broker.trim())
            .filter(Boolean),
        },
        keycloak: {
          status: keycloakConfigured ? "configured" : "missing_config",
          realm: this.config.get<string>("KEYCLOAK_REALM") ?? null,
          url: this.config.get<string>("KEYCLOAK_URL") ?? null,
        },
        memory: this.memoryUsage(),
      },
    };
  }

  private postgresStatus() {
    return {
      status: this.dataSource.isInitialized ? "up" : "down",
      database: this.dataSource.options.database ?? null,
      type: this.dataSource.options.type,
    };
  }

  private async redisStatus(): Promise<{
    status: "up" | "down";
    latencyMs: number | null;
    message?: string;
  }> {
    const started = Date.now();
    try {
      await Promise.race([
        this.redis.ping(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Redis ping timeout")), 800),
        ),
      ]);

      return {
        status: "up",
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      return {
        status: "down",
        latencyMs: null,
        message: err instanceof Error ? err.message : "Redis ping failed",
      };
    }
  }

  private memoryUsage() {
    const usage = process.memoryUsage();
    return {
      status: "ok",
      rssMb: Math.round(usage.rss / 1024 / 1024),
      heapUsedMb: Math.round(usage.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(usage.heapTotal / 1024 / 1024),
    };
  }
}
