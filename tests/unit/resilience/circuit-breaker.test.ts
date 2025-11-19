/**
 * Tests for Circuit Breaker Implementation
 */

import { describe, it, beforeEach , expect } from 'vitest'
import {
  CircuitBreakerManager,
  createCircuitBreaker,
  isInState,
  getState,
  getFailureRate,
  getSuccessRate,
} from '@/resilience/circuit-breaker';

describe('Circuit Breaker', () => {
  describe('CircuitBreakerManager', () => {
    let manager: CircuitBreakerManager;

    beforeEach(() => {
      manager = new CircuitBreakerManager();
    });

    describe('getOrCreate', () => {
      it('should create new circuit breaker with default config', () => {
        const breaker = manager.getOrCreate('test-service');

        expect(breaker.name).toBe('test-service');
        expect(breaker.state).toBe('closed');
        expect(breaker.config.failureThreshold).toBe(5);
        expect(breaker.config.successThreshold).toBe(2);
        expect(breaker.config.timeout).toBe(60000);
      });

      it('should create new circuit breaker with custom config', () => {
        const breaker = manager.getOrCreate('test-service', {
          failureThreshold: 10,
          successThreshold: 3,
          timeout: 30000,
        });

        expect(breaker.config.failureThreshold).toBe(10);
        expect(breaker.config.successThreshold).toBe(3);
        expect(breaker.config.timeout).toBe(30000);
      });

      it('should return existing circuit breaker on subsequent calls', () => {
        const breaker1 = manager.getOrCreate('test-service');
        const breaker2 = manager.getOrCreate('test-service');

        expect(breaker1).toBe(breaker2);
      });

      it('should create separate breakers for different names', () => {
        const breaker1 = manager.getOrCreate('service-1');
        const breaker2 = manager.getOrCreate('service-2');

        expect(breaker1).not.toBe(breaker2);
        expect(breaker1.name).toBe('service-1');
        expect(breaker2.name).toBe('service-2');
      });
    });

    describe('get', () => {
      it('should return null for non-existent breaker', () => {
        const breaker = manager.get('non-existent');
        expect(breaker).toBe(null);
      });

      it('should return existing breaker', () => {
        const created = manager.getOrCreate('test-service');
        const retrieved = manager.get('test-service');

        expect(created).toBe(retrieved);
      });
    });

    describe('State Transitions', () => {
      describe('closed to open', () => {
        it('should open circuit after failure threshold reached', () => {
          const breaker = manager.getOrCreate('test-service', {
            failureThreshold: 3,
            successThreshold: 2,
            timeout: 60000,
          });

          expect(breaker.state).toBe('closed');

          // Record failures up to threshold
          manager.recordFailure('test-service', new Error('Failure 1'));
          expect(breaker.state).toBe('closed');

          manager.recordFailure('test-service', new Error('Failure 2'));
          expect(breaker.state).toBe('closed');

          manager.recordFailure('test-service', new Error('Failure 3'));
          expect(breaker.state).toBe('open');
        });

        it('should not open circuit if failures below threshold', () => {
          const breaker = manager.getOrCreate('test-service', {
            failureThreshold: 5,
            successThreshold: 2,
            timeout: 60000,
          });

          manager.recordFailure('test-service', new Error('Failure 1'));
          manager.recordFailure('test-service', new Error('Failure 2'));

          expect(breaker.state).toBe('closed');
        });
      });

      describe('open to half-open', () => {
        it('should transition to half-open after timeout', async () => {
          const breaker = manager.getOrCreate('test-service', {
            failureThreshold: 2,
            successThreshold: 2,
            timeout: 100, // Short timeout for testing
          });

          // Open the circuit
          manager.recordFailure('test-service', new Error('Failure 1'));
          manager.recordFailure('test-service', new Error('Failure 2'));
          expect(breaker.state).toBe('open');

          // Before timeout, should still reject
          expect(manager.canExecute('test-service')).toBe(false);

          // Wait for timeout
          await new Promise((resolve) => setTimeout(resolve, 150));

          // canExecute should transition to half-open
          expect(manager.canExecute('test-service')).toBe(true);
          expect(breaker.state).toBe('half-open');
        });

        it('should not transition before timeout elapsed', () => {
          const breaker = manager.getOrCreate('test-service', {
            failureThreshold: 2,
            successThreshold: 2,
            timeout: 60000,
          });

          // Open the circuit
          manager.recordFailure('test-service', new Error('Failure 1'));
          manager.recordFailure('test-service', new Error('Failure 2'));

          expect(breaker.state).toBe('open');
          expect(manager.canExecute('test-service')).toBe(false);
        });
      });

      describe('half-open to closed', () => {
        it('should close circuit after success threshold in half-open', async () => {
          const breaker = manager.getOrCreate('test-service', {
            failureThreshold: 2,
            successThreshold: 2,
            timeout: 100,
          });

          // Open the circuit
          manager.recordFailure('test-service', new Error('Failure 1'));
          manager.recordFailure('test-service', new Error('Failure 2'));
          expect(breaker.state).toBe('open');

          // Wait for timeout and transition to half-open
          await new Promise((resolve) => setTimeout(resolve, 150));
          manager.canExecute('test-service');
          expect(breaker.state).toBe('half-open');

          // Record successes
          manager.recordSuccess('test-service');
          expect(breaker.state).toBe('half-open');

          manager.recordSuccess('test-service');
          expect(breaker.state).toBe('closed');
        });

        it('should reset failure count when closing', async () => {
          const breaker = manager.getOrCreate('test-service', {
            failureThreshold: 2,
            successThreshold: 2,
            timeout: 100,
          });

          // Open the circuit
          manager.recordFailure('test-service', new Error('Failure 1'));
          manager.recordFailure('test-service', new Error('Failure 2'));

          // Transition to half-open and close
          await new Promise((resolve) => setTimeout(resolve, 150));
          manager.canExecute('test-service');
          manager.recordSuccess('test-service');
          manager.recordSuccess('test-service');

          expect(breaker.state).toBe('closed');
          expect(breaker.metrics.failedRequests).toBe(0);
        });
      });

      describe('half-open to open', () => {
        it('should reopen on failure in half-open state', async () => {
          const breaker = manager.getOrCreate('test-service', {
            failureThreshold: 2,
            successThreshold: 2,
            timeout: 100,
          });

          // Open the circuit
          manager.recordFailure('test-service', new Error('Failure 1'));
          manager.recordFailure('test-service', new Error('Failure 2'));

          // Transition to half-open
          await new Promise((resolve) => setTimeout(resolve, 150));
          manager.canExecute('test-service');
          expect(breaker.state).toBe('half-open');

          // Any failure reopens the circuit
          manager.recordFailure('test-service', new Error('Failure 3'));
          expect(breaker.state).toBe('open');
        });
      });
    });

    describe('canExecute', () => {
      it('should return true for closed circuit', () => {
        manager.getOrCreate('test-service');
        expect(manager.canExecute('test-service')).toBe(true);
      });

      it('should return false for open circuit before timeout', () => {
        const breaker = manager.getOrCreate('test-service', {
          failureThreshold: 2,
          successThreshold: 2,
          timeout: 60000,
        });

        manager.recordFailure('test-service', new Error('Failure 1'));
        manager.recordFailure('test-service', new Error('Failure 2'));

        expect(breaker.state).toBe('open');
        expect(manager.canExecute('test-service')).toBe(false);
      });

      it('should return true for half-open circuit', async () => {
        const breaker = manager.getOrCreate('test-service', {
          failureThreshold: 2,
          successThreshold: 2,
          timeout: 100,
        });

        manager.recordFailure('test-service', new Error('Failure 1'));
        manager.recordFailure('test-service', new Error('Failure 2'));

        await new Promise((resolve) => setTimeout(resolve, 150));
        manager.canExecute('test-service');

        expect(breaker.state).toBe('half-open');
        expect(manager.canExecute('test-service')).toBe(true);
      });

      it('should return true for non-existent breaker', () => {
        expect(manager.canExecute('non-existent')).toBe(true);
      });
    });

    describe('recordSuccess', () => {
      it('should update metrics on success', () => {
        const breaker = manager.getOrCreate('test-service');

        manager.recordSuccess('test-service');

        expect(breaker.metrics.totalRequests).toBe(1);
        expect(breaker.metrics.successfulRequests).toBe(1);
        expect(breaker.metrics.lastSuccessTime instanceof Date).toBeTruthy();
      });

      it('should track multiple successes', () => {
        const breaker = manager.getOrCreate('test-service');

        manager.recordSuccess('test-service');
        manager.recordSuccess('test-service');
        manager.recordSuccess('test-service');

        expect(breaker.metrics.totalRequests).toBe(3);
        expect(breaker.metrics.successfulRequests).toBe(3);
      });
    });

    describe('recordFailure', () => {
      it('should update metrics on failure', () => {
        const breaker = manager.getOrCreate('test-service');

        manager.recordFailure('test-service', new Error('Test error'));

        expect(breaker.metrics.totalRequests).toBe(1);
        expect(breaker.metrics.failedRequests).toBe(1);
        expect(breaker.metrics.lastFailureTime instanceof Date).toBeTruthy();
      });

      it('should track multiple failures', () => {
        const breaker = manager.getOrCreate('test-service', {
          failureThreshold: 10,
          successThreshold: 2,
          timeout: 60000,
        });

        manager.recordFailure('test-service', new Error('Error 1'));
        manager.recordFailure('test-service', new Error('Error 2'));

        expect(breaker.metrics.totalRequests).toBe(2);
        expect(breaker.metrics.failedRequests).toBe(2);
      });
    });

    describe('reset', () => {
      it('should reset circuit to closed state', () => {
        const breaker = manager.getOrCreate('test-service', {
          failureThreshold: 2,
          successThreshold: 2,
          timeout: 60000,
        });

        // Open the circuit
        manager.recordFailure('test-service', new Error('Failure 1'));
        manager.recordFailure('test-service', new Error('Failure 2'));
        expect(breaker.state).toBe('open');

        // Reset
        manager.reset('test-service');

        expect(breaker.state).toBe('closed');
        expect(breaker.metrics.failedRequests).toBe(0);
        expect(breaker.metrics.successfulRequests).toBe(0);
      });

      it('should handle reset of non-existent breaker', () => {
        // Should not throw
        manager.reset('non-existent');
      });
    });

    describe('getAll', () => {
      it('should return empty map initially', () => {
        const all = manager.getAll();
        expect(all.size).toBe(0);
      });

      it('should return all created breakers', () => {
        manager.getOrCreate('service-1');
        manager.getOrCreate('service-2');
        manager.getOrCreate('service-3');

        const all = manager.getAll();
        expect(all.size).toBe(3);
        expect(all.has('service-1')).toBeTruthy();
        expect(all.has('service-2')).toBeTruthy();
        expect(all.has('service-3')).toBeTruthy();
      });

      it('should return a copy of the map', () => {
        manager.getOrCreate('service-1');

        const all1 = manager.getAll();
        const all2 = manager.getAll();

        expect(all1).not.toBe(all2);
      });
    });
  });

  describe('createCircuitBreaker', () => {
    it('should create breaker with default config', () => {
      const breaker = createCircuitBreaker('test-service');

      expect(breaker.name).toBe('test-service');
      expect(breaker.state).toBe('closed');
      expect(breaker.config.failureThreshold).toBe(5);
      expect(breaker.config.successThreshold).toBe(2);
      expect(breaker.config.timeout).toBe(60000);
      expect(breaker.metrics.totalRequests).toBe(0);
    });

    it('should create breaker with custom config', () => {
      const breaker = createCircuitBreaker('test-service', {
        failureThreshold: 10,
        successThreshold: 3,
        timeout: 30000,
      });

      expect(breaker.config.failureThreshold).toBe(10);
      expect(breaker.config.successThreshold).toBe(3);
      expect(breaker.config.timeout).toBe(30000);
    });
  });

  describe('isInState', () => {
    it('should return true for matching state', () => {
      const breaker = createCircuitBreaker('test-service');

      expect(isInState(breaker, 'closed')).toBe(true);
      expect(isInState(breaker, 'open')).toBe(false);
      expect(isInState(breaker, 'half-open')).toBe(false);
    });

    it('should work for all states', () => {
      const breaker = createCircuitBreaker('test-service');

      breaker.state = 'open';
      expect(isInState(breaker, 'open')).toBe(true);
      expect(isInState(breaker, 'closed')).toBe(false);

      breaker.state = 'half-open';
      expect(isInState(breaker, 'half-open')).toBe(true);
      expect(isInState(breaker, 'open')).toBe(false);

      breaker.state = 'closed';
      expect(isInState(breaker, 'closed')).toBe(true);
      expect(isInState(breaker, 'open')).toBe(false);
    });
  });

  describe('getState', () => {
    it('should return current state', () => {
      const breaker = createCircuitBreaker('test-service');

      expect(getState(breaker)).toBe('closed');

      breaker.state = 'open';
      expect(getState(breaker)).toBe('open');

      breaker.state = 'half-open';
      expect(getState(breaker)).toBe('half-open');
    });
  });

  describe('getFailureRate', () => {
    it('should return 0 for no requests', () => {
      const breaker = createCircuitBreaker('test-service');
      expect(getFailureRate(breaker)).toBe(0);
    });

    it('should calculate correct failure rate', () => {
      const breaker = createCircuitBreaker('test-service');

      breaker.metrics.totalRequests = 10;
      breaker.metrics.failedRequests = 3;

      expect(getFailureRate(breaker)).toBe(0.3);
    });

    it('should return 1 for all failures', () => {
      const breaker = createCircuitBreaker('test-service');

      breaker.metrics.totalRequests = 5;
      breaker.metrics.failedRequests = 5;

      expect(getFailureRate(breaker)).toBe(1);
    });

    it('should return 0 for no failures', () => {
      const breaker = createCircuitBreaker('test-service');

      breaker.metrics.totalRequests = 10;
      breaker.metrics.failedRequests = 0;

      expect(getFailureRate(breaker)).toBe(0);
    });
  });

  describe('getSuccessRate', () => {
    it('should return 0 for no requests', () => {
      const breaker = createCircuitBreaker('test-service');
      expect(getSuccessRate(breaker)).toBe(0);
    });

    it('should calculate correct success rate', () => {
      const breaker = createCircuitBreaker('test-service');

      breaker.metrics.totalRequests = 10;
      breaker.metrics.successfulRequests = 7;

      expect(getSuccessRate(breaker)).toBe(0.7);
    });

    it('should return 1 for all successes', () => {
      const breaker = createCircuitBreaker('test-service');

      breaker.metrics.totalRequests = 5;
      breaker.metrics.successfulRequests = 5;

      expect(getSuccessRate(breaker)).toBe(1);
    });

    it('should return 0 for no successes', () => {
      const breaker = createCircuitBreaker('test-service');

      breaker.metrics.totalRequests = 10;
      breaker.metrics.successfulRequests = 0;

      expect(getSuccessRate(breaker)).toBe(0);
    });
  });
});
