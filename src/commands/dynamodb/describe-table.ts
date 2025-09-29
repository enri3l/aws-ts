/**
 * DynamoDB describe table command
 *
 * Displays detailed information about a specific DynamoDB table including
 * schema, indexes, billing mode, and status with multiple output formats.
 *
 */

import { Args, Command, Flags } from "@oclif/core";
import { DataFormat, DataProcessor } from "../../lib/data-processing.js";
import type { DynamoDBDescribeTable } from "../../lib/dynamodb-schemas.js";
import { DynamoDBDescribeTableSchema } from "../../lib/dynamodb-schemas.js";
import { handleDynamoDBCommandError } from "../../lib/errors.js";
import type { TableDescription } from "../../services/dynamodb-service.js";
import { DynamoDBService } from "../../services/dynamodb-service.js";

/**
 * DynamoDB describe table command for detailed table information
 *
 * Provides information about a DynamoDB table including
 * schema, indexes, billing configuration, and operational status.
 *
 * @public
 */
export default class DynamoDBDescribeTableCommand extends Command {
  static override readonly description = "Show detailed information about a DynamoDB table";

  static override readonly examples = [
    {
      description: "Describe a table with default table format",
      command: "<%= config.bin %> <%= command.id %> my-table",
    },
    {
      description: "Describe a table with JSON output",
      command: "<%= config.bin %> <%= command.id %> my-table --format json",
    },
    {
      description: "Describe a table in a specific region",
      command: "<%= config.bin %> <%= command.id %> my-table --region us-west-2",
    },
    {
      description: "Describe a table using a specific AWS profile",
      command: "<%= config.bin %> <%= command.id %> my-table --profile production",
    },
    {
      description: "Describe a table with CSV output for analysis",
      command: "<%= config.bin %> <%= command.id %> my-table --format csv",
    },
    {
      description: "Verbose table description with debug information",
      command: "<%= config.bin %> <%= command.id %> my-table --verbose",
    },
  ];

  static override readonly args = {
    tableName: Args.string({
      name: "tableName",
      description: "Name of the DynamoDB table to describe",
      required: true,
    }),
  };

  static override readonly flags = {
    region: Flags.string({
      char: "r",
      description: "AWS region containing the table",
      helpValue: "REGION",
    }),

    profile: Flags.string({
      char: "p",
      description: "AWS profile to use for authentication",
      helpValue: "PROFILE_NAME",
    }),

    format: Flags.string({
      char: "f",
      description: "Output format for table information",
      options: ["table", "json", "jsonl", "csv"],
      default: "table",
    }),

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output with debug information",
      default: false,
    }),
  };

  /**
   * Execute the DynamoDB describe table command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(DynamoDBDescribeTableCommand);

    try {
      // Validate input using Zod schema
      const input: DynamoDBDescribeTable = DynamoDBDescribeTableSchema.parse({
        tableName: args.tableName,
        region: flags.region,
        profile: flags.profile,
        format: flags.format,
        verbose: flags.verbose,
      });

      // Create DynamoDB service instance
      const dynamoService = new DynamoDBService({
        enableDebugLogging: input.verbose,
        enableProgressIndicators: true,
        clientConfig: {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      });

      // Describe table from DynamoDB
      const tableDescription = await dynamoService.describeTable(input.tableName, {
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      });

      // Format output based on requested format
      this.formatAndDisplayOutput(tableDescription, input.format);
    } catch (error) {
      const formattedError = handleDynamoDBCommandError(
        error,
        flags.verbose,
        "describe table operation",
      );
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Format and display the table description output
   *
   * @param tableDescription - Table description to display
   * @param format - Output format to use
   * @throws Error When unsupported output format is specified
   * @internal
   */
  private formatAndDisplayOutput(tableDescription: TableDescription, format: string): void {
    switch (format) {
      case "table": {
        this.displayTableFormat(tableDescription);
        break;
      }

      case "json": {
        this.log(JSON.stringify(tableDescription, undefined, 2));
        break;
      }

      case "jsonl": {
        this.log(JSON.stringify(tableDescription));
        break;
      }

      case "csv": {
        this.displayCsvFormat(tableDescription);
        break;
      }

      default: {
        throw new Error(`Unsupported output format: ${format}`);
      }
    }
  }

  /**
   * Display table description in human-readable table format
   *
   * @param table - Table description to display
   * @internal
   */
  private displayTableFormat(table: TableDescription): void {
    this.log(`\n=== Table: ${table.tableName} ===\n`);

    // Basic table information
    const basicInfo = [
      { Property: "Table Name", Value: table.tableName },
      { Property: "Status", Value: table.tableStatus },
      { Property: "Billing Mode", Value: table.billingMode || "N/A" },
      { Property: "Item Count", Value: table.itemCount?.toLocaleString() || "N/A" },
      {
        Property: "Table Size",
        Value: table.tableSizeBytes
          ? `${(table.tableSizeBytes / 1024 / 1024).toFixed(2)} MB`
          : "N/A",
      },
    ];

    if (table.provisionedThroughput) {
      basicInfo.push(
        {
          Property: "Read Capacity",
          Value: table.provisionedThroughput.readCapacityUnits.toString(),
        },
        {
          Property: "Write Capacity",
          Value: table.provisionedThroughput.writeCapacityUnits.toString(),
        },
      );
    }

    const processor = new DataProcessor({ format: DataFormat.CSV });
    this.log("Basic Information:");
    this.log(processor.formatOutput(basicInfo.map((item, index) => ({ data: item, index }))));

    // Key Schema
    if (table.keySchema.length > 0) {
      this.log("\nKey Schema:");
      const keySchemaData = table.keySchema.map((key) => ({
        "Attribute Name": key.attributeName,
        "Key Type": key.keyType,
      }));
      this.log(processor.formatOutput(keySchemaData.map((item, index) => ({ data: item, index }))));
    }

    // Attribute Definitions
    if (table.attributeDefinitions.length > 0) {
      this.log("\nAttribute Definitions:");
      const attributeData = table.attributeDefinitions.map((attribute) => ({
        "Attribute Name": attribute.attributeName,
        "Attribute Type": attribute.attributeType,
      }));
      this.log(processor.formatOutput(attributeData.map((item, index) => ({ data: item, index }))));
    }

    // Global Secondary Indexes
    if (table.globalSecondaryIndexes && table.globalSecondaryIndexes.length > 0) {
      this.log("\nGlobal Secondary Indexes:");
      const gsiData = table.globalSecondaryIndexes.map((gsi) => ({
        "Index Name": gsi.indexName,
        "Key Schema": gsi.keySchema
          .map((key) => `${key.attributeName} (${key.keyType})`)
          .join(", "),
      }));
      this.log(processor.formatOutput(gsiData.map((item, index) => ({ data: item, index }))));
    }

    // Local Secondary Indexes
    if (table.localSecondaryIndexes && table.localSecondaryIndexes.length > 0) {
      this.log("\nLocal Secondary Indexes:");
      const lsiData = table.localSecondaryIndexes.map((lsi) => ({
        "Index Name": lsi.indexName,
        "Key Schema": lsi.keySchema
          .map((key) => `${key.attributeName} (${key.keyType})`)
          .join(", "),
      }));
      this.log(processor.formatOutput(lsiData.map((item, index) => ({ data: item, index }))));
    }
  }

  /**
   * Display table description in CSV format
   *
   * @param table - Table description to display
   * @internal
   */
  private displayCsvFormat(table: TableDescription): void {
    // Flatten table data for CSV export
    const csvData = [
      {
        TableName: table.tableName,
        Status: table.tableStatus,
        BillingMode: table.billingMode || "",
        ItemCount: table.itemCount || 0,
        TableSizeBytes: table.tableSizeBytes || 0,
        PartitionKey: table.keySchema.find((k) => k.keyType === "HASH")?.attributeName || "",
        SortKey: table.keySchema.find((k) => k.keyType === "RANGE")?.attributeName || "",
        ReadCapacity: table.provisionedThroughput?.readCapacityUnits || 0,
        WriteCapacity: table.provisionedThroughput?.writeCapacityUnits || 0,
        GSICount: table.globalSecondaryIndexes?.length || 0,
        LSICount: table.localSecondaryIndexes?.length || 0,
      },
    ];

    const processor = new DataProcessor({ format: DataFormat.CSV });
    const output = processor.formatOutput(csvData.map((item, index) => ({ data: item, index })));
    this.log(output);
  }
}
