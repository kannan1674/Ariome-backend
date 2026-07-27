const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.DB_URI).then(con => {
            console.log(`MongoDB connected with host: ${con.connection.host}`);
        });
    } catch (error) {
        console.log(error);
    }
};

module.exports = connectDB;