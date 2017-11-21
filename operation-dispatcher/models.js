const Redis = require('redis');
const redis = Redis.createClient(process.env.REDIS_URL);

const ONE_HOUR_IN_SECONDS = 60 * 60;
const LINK_OPERATION_EXPIRY_TIME_IN_SECONDS = 24 * ONE_HOUR_IN_SECONDS;
const WebhookStatusStore = {
  set(webhookId, status, expiresIn=LINK_OPERATION_EXPIRY_TIME_IN_SECONDS) {
    return new Promise((resolve, reject) => {
      redis.set(`webhook:status:${webhookId}`, JSON.stringify(status), 'EX', expiresIn, (err, id) => {
        if (err) {
          reject(err);
        } else {
          // Resolves the message id.
          resolve(id);
        }
      });
    });
  },
  get(webhookId, hideSensitiveKeys=true) {
    return new Promise((resolve, reject) => {
      redis.get(`webhook:status:${webhookId}`, (err, data) => {
        if (err) {
          reject(err);
        } else {
          // Resolves the cached data.
          const parsed = JSON.parse(data);
          if (hideSensitiveKeys) {
            if (parsed) {
              resolve(parsed);
            } else {
              // No operation id was found
              return null;
            }
          } else {
            resolve(parsed);
          }
        }
      });
    });
  },
};

const RedisMQ = require('rsmq');
const redisQueue = new RedisMQ({
  client: redis,
  ns: 'rsmq',
});
const WebhookQueue = {
  queueName: process.env.REDIS_QUEUE_NAME || 'webhookQueue',
  initialize() {
    return new Promise((resolve, reject) => {
      redisQueue.createQueue({qname: this.queueName}, (err, resp) => {
        if (err && err.name === 'queueExists') {
          // Queue was already created.
          resolve();
        } else if (err) {
          reject(err);
        } else {
          resolve(resp);
        }
      });
    });
  },
  push(data) {
    return new Promise((resolve, reject) => {
      redisQueue.sendMessage({qname: this.queueName, message: JSON.stringify(data)}, (err, id) => {
        if (err) {
          reject(err);
        } else {
          // Resolves the message id.
          resolve(id);
        }
      });
    });
  },
  pop() {
    return new Promise((resolve, reject) => {
      redisQueue.popMessage({qname: this.queueName}, (err, data) => {
        if (err) {
          reject(err);
        } else if (!data || typeof data.id === 'undefined') {
          // No items in the queue
          resolve(null);
        } else {
          // Item was found on the end of the queue!
          resolve({data: JSON.parse(data.message), id: data.id});
        }
      });
    });
  }
};
WebhookQueue.initialize();

const Sequelize = require('sequelize');
const schema = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: process.env.DATABASE_REQUIRE_SSL.toLowerCase() === 'true' ? true : false,
  },
});

const User = schema.define('user', {
  id: {
    type: Sequelize.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  username: {
    type: Sequelize.STRING,
    unique: true,
  },
  email: {
    type: Sequelize.STRING,
    allowNull: true,
  },
  githubId: {
    type: Sequelize.STRING,
    allowNull: false,
    unique: true,
  },
  accessToken: {
    type: Sequelize.STRING,
    allowNull: false,
  },

  // Did the user register with the `public` scope (only providing access to open source repos)?
  publicScope: { type: Sequelize.BOOLEAN },

  createdAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW},
  lastLoggedInAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW},
});

const Link = schema.define('link', {
  id: {
    type: Sequelize.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  name: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  enabled: {
    type: Sequelize.BOOLEAN,
    allowNull: false,
  },

  webhookId: { type: Sequelize.STRING, defaultValue: () => uuid.v4().replace(/-/g, '') },

  lastSyncedAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW},

  upstreamType: {type: Sequelize.ENUM, values: ['repo']},
  upstreamOwner: Sequelize.STRING,
  upstreamRepo: Sequelize.STRING,
  upstreamIsFork: Sequelize.BOOLEAN,
  upstreamBranches: Sequelize.TEXT,
  upstreamBranch: Sequelize.STRING,
  // Store the last known SHA for the commit at the HEAD of the `upstreamBranch` branch.
  upstreamLastSHA: Sequelize.STRING,

  forkType: {type: Sequelize.ENUM, values: ['repo', 'fork-all']},
  forkOwner: Sequelize.STRING,
  forkRepo: Sequelize.STRING,
  forkBranches: Sequelize.TEXT,
  forkBranch: Sequelize.STRING,
});

// A link has a foreign key to a user.
Link.belongsTo(User, {as: 'owner', foreignKey: 'ownerId'});

module.exports = { WebhookStatusStore, WebhookQueue, User, Link };
