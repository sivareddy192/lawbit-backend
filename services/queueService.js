import cache from './cacheService.js';

class BackgroundTaskQueue {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.handlers = new Map();
    this.initDefaultHandlers();
  }

  initDefaultHandlers() {
    this.registerHandler('INVALIDATE_CATALOGUE_CACHE', async () => {
      await cache.invalidateCatalogueCache();
    });

    this.registerHandler('NOTIFY_NEW_ORDER', async ({ io, orderId, totalAmount, customerName }) => {
      if (io) {
        io.to('admin_dashboard').emit('new_order', {
          orderId,
          totalAmount,
          customerName,
          timestamp: new Date(),
        });
      }
    });

    this.registerHandler('UPDATE_PRODUCT_ORDER_COUNT', async ({ verifiedItems }) => {
      try {
        const ProductModel = (await import('../models/product.model.js')).default;
        const bulkOps = (verifiedItems || []).map((item) => ({
          updateOne: {
            filter: { _id: item.food || item.productId },
            update: { $inc: { totalOrders: item.quantity || 1 } },
          },
        }));
        if (bulkOps.length > 0) {
          await ProductModel.bulkWrite(bulkOps);
        }
      } catch (err) {
        console.warn('Background product order count update warning:', err.message);
      }
    });
  }

  registerHandler(taskType, handlerFn) {
    this.handlers.set(taskType, handlerFn);
  }

  enqueue(taskType, payload = {}) {
    this.queue.push({
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      taskType,
      payload,
      createdAt: Date.now(),
    });
    this.processNext();
  }

  async processNext() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const task = this.queue.shift();

    try {
      const handler = this.handlers.get(task.taskType);
      if (handler) {
        await handler(task.payload);
      } else {
        console.warn(`No handler registered for background task: ${task.taskType}`);
      }
    } catch (err) {
      console.error(`Error processing background task ${task.taskType}:`, err.message);
    } finally {
      this.isProcessing = false;
      if (this.queue.length > 0) {
        setImmediate(() => this.processNext());
      }
    }
  }

  getQueueSize() {
    return this.queue.length;
  }
}

export const taskQueue = new BackgroundTaskQueue();
export default taskQueue;
