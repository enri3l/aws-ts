/**
 * TypeScript declarations for AWS SDK client mock matchers in Vitest
 *
 * Extends Vitest's expect interface with AWS SDK specific matchers
 * for testing AWS service interactions.
 */

declare module "vitest" {
  interface Assertion<T = any> {
    toHaveReceivedCommand(command: new (...arguments_: any[]) => any): T;
    toHaveReceivedCommandTimes(command: new (...arguments_: any[]) => any, times: number): T;
    toHaveReceivedCommandWith(command: new (...arguments_: any[]) => any, input: any): T;
    toHaveReceivedCommandOnce(command: new (...arguments_: any[]) => any): T;
    toHaveReceivedCommandExactlyOnceWith(command: new (...arguments_: any[]) => any, input: any): T;
    toHaveReceivedNthCommandWith(
      command: new (...arguments_: any[]) => any,
      call: number,
      input: any,
    ): T;
    toHaveReceivedLastCommandWith(command: new (...arguments_: any[]) => any, input: any): T;
    toHaveReceivedAnyCommand(): T;
  }

  interface AsymmetricMatchersContaining {
    toHaveReceivedCommand(command: new (...arguments_: any[]) => any): any;
    toHaveReceivedCommandTimes(command: new (...arguments_: any[]) => any, times: number): any;
    toHaveReceivedCommandWith(command: new (...arguments_: any[]) => any, input: any): any;
    toHaveReceivedCommandOnce(command: new (...arguments_: any[]) => any): any;
    toHaveReceivedCommandExactlyOnceWith(
      command: new (...arguments_: any[]) => any,
      input: any,
    ): any;
    toHaveReceivedNthCommandWith(
      command: new (...arguments_: any[]) => any,
      call: number,
      input: any,
    ): any;
    toHaveReceivedLastCommandWith(command: new (...arguments_: any[]) => any, input: any): any;
    toHaveReceivedAnyCommand(): any;
  }
}
