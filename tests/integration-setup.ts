/**
 * Integration test setup configuration for TestContainers + DynamoDB Local
 *
 * This configuration sets up TestContainers with DynamoDB Local for integration
 * tests that require real AWS service behavior. Includes proper container
 * lifecycle management and AWS SDK configuration.
 *
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { afterAll, beforeAll } from "vitest";

// Global container instance for sharing across tests
let dynamoContainer: StartedTestContainer;
let dynamoClient: DynamoDBClient;

/**
 * Global setup for integration tests using DynamoDB Local
 *
 * Starts a DynamoDB Local container before all integration tests
 * and configures the AWS SDK to use the local endpoint.
 */
beforeAll(async () => {
  // Start DynamoDB Local container
  dynamoContainer = await new GenericContainer("amazon/dynamodb-local:latest")
    .withExposedPorts(8000)
    .withCommand(["-jar", "DynamoDBLocal.jar", "-sharedDb", "-inMemory"])
    .start();

  const dynamoPort = dynamoContainer.getMappedPort(8000);
  const dynamoEndpoint = `http://localhost:${dynamoPort}`;

  // Configure DynamoDB client for local endpoint
  dynamoClient = new DynamoDBClient({
    endpoint: dynamoEndpoint,
    region: "local",
    credentials: {
      accessKeyId: "test",
      secretAccessKey: "test",
    },
  });

  // Set environment variables for tests
  process.env.DYNAMODB_ENDPOINT = dynamoEndpoint;
  process.env.AWS_REGION = "local";
  process.env.AWS_INTEGRATION_TEST = "true";
}, 60_000);

/**
 * Global teardown for integration tests
 *
 * Stops the DynamoDB Local container after all integration tests complete
 * and cleans up AWS SDK client connections.
 */
afterAll(async () => {
  if (dynamoClient) {
    dynamoClient.destroy();
  }
  if (dynamoContainer) {
    await dynamoContainer.stop();
  }
}, 30_000);

/**
 * Get the configured DynamoDB client for integration tests
 *
 * @returns The DynamoDB client configured for local testing
 */
export function getDynamoClient(): DynamoDBClient {
  return dynamoClient;
}
