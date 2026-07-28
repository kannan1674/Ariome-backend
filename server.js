// const dotenv = require('dotenv');
// const path = require('path');

// dotenv.config({ path: path.resolve(__dirname, 'config/config.env') });
// dotenv.config({ path: path.resolve(__dirname, '.env') });

// const connectDB = require('./config/db');
// const { createApp, mountRoutes } = require('./app');

// global.__ROUTES_READY__ = false;

// const app = createApp();
// const port = Number(process.env.PORT) || 8000;

// connectDB();

// app.listen(port, () => {
//     console.log(`Server is running on port ${port} in ${process.env.NODE_ENV} mode`);
//     console.log('Loading API routes in background (first start may take 2–3 min on this machine)...');

//     setImmediate(() => {
//         try {
//             mountRoutes(app);
//         } catch (err) {
//             console.error('Failed to load routes:', err.message);
//             process.exit(1);
//         }
//     });
// });
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, 'config/config.env') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

const loadSecrets = require('./loadSecrets');

global.__ROUTES_READY__ = false;

async function startServer() {
    if (process.env.LOAD_AWS_SECRETS === 'true') {
        await loadSecrets();
    }

    const connectDB = require('./config/db');
    const { createApp, mountRoutes } = require('./app');

    const app = createApp();
    const port = Number(process.env.PORT) || 8000;

    await connectDB();

    app.listen(port, () => {
        console.log(`Server is running on port ${port} in ${process.env.NODE_ENV} mode`);
        console.log('Loading API routes in background (first start may take 2–3 min on this machine)...');

        setImmediate(() => {
            try {
                mountRoutes(app);
            } catch (err) {
                console.error('Failed to load routes:', err.message);
                process.exit(1);
            }
        });
    });
}

startServer().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
});