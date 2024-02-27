const TelegramBot = require('node-telegram-bot-api');
const mysql = require('mysql');
const cron = require('node-cron');

require('dotenv').config();

// Replace 'YOUR_TELEGRAM_BOT_TOKEN' with your bot's token
const token = process.env.botToken;

// Replace 'YOUR_CHAT_ID' with the actual chat ID where you want to send the message
const chatId = process.env.chatId;

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, { polling: true });

// Create a connection to the MariaDB database
const pool = mysql.createPool({
    host: process.env.dbHost, // Change this to your MariaDB host
    port: process.env.dbPort,
    user: process.env.dbUser, // Change this to your MariaDB username
    password: process.env.dbPassword, // Change this to your MariaDB password
    database: 'cacca', // Change this to your MariaDB database name
    keepAlive: true,
    keepAliveInitialDelay: 30000 // 30 seconds
});

bot.on('message', (msg) => {
    const userId = msg.from.id;
    const messageText = msg.text ? msg.text : ''; // Retrieve the message text
    const messageDate = new Date(msg.date * 1000).toISOString().split('T')[0]; // Convert timestamp to date
    let messageHour = new Date(msg.date * 1000).toISOString().split('T')[1].split('.')[0]; // Extract hour part

    // Check if the message contains the poop emoji '💩'
    if (messageText == '💩') {

        // Parse the hour and add one hour to it
        const [hour, minute, second] = messageHour.split(':').map(Number);
        const newHour = (hour + 1) % 24; // Add one hour (considering 24-hour time format)
        messageHour = `${newHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second.toString().padStart(2, '0')}`;

        // Acquire a connection from the pool
        pool.getConnection((err, connection) => {
            if (err) {
                console.error('Error getting connection from pool:', err);
                return;
            }

            // Insert data into the 'messages' table
            const insertQuery = 'INSERT INTO messages (user_id, message_date, message_hour) VALUES (?, ?, ?)';
            connection.query(insertQuery, [userId, messageDate, messageHour], (err) => {
                // Release the connection back to the pool after query execution
                connection.release();

                if (err) {
                    console.error('Error inserting data:', err);
                } else {
                    console.log('Data inserted into the database.');
                }
            });
        });
    }
});

// Daily summary
cron.schedule('55 23 * * *', () => {
    let message = 'I cagoni di oggi: \n';

    // Acquire a connection from the pool
    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error getting connection from pool:', err);
            return;
        }

        // Query to get the count of messages sent by each user today
        const todayQuery = `
            SELECT m.user_id, u.name, COUNT(*) AS messages_sent_today
            FROM messages m, users u
            WHERE m.user_id = u.user_id AND m.message_date = CURRENT_DATE
            GROUP BY m.user_id
            ORDER BY messages_sent_today DESC;
            `;

        // Query to get the count of messages sent by each user yesterday
        const yesterdayQuery = `
            SELECT user_id, COUNT(*) AS messages_sent_yesterday
            FROM messages
            WHERE message_date = CURRENT_DATE - INTERVAL 1 DAY
            GROUP BY user_id
            ORDER BY messages_sent_yesterday DESC;
            `;

        // Execute the query for today's data
        connection.query(todayQuery, (errorToday, resultsToday) => {
            if (errorToday) {
                console.error('Error executing today\'s query:', errorToday);
                throw errorToday;
            }

            try {
                // Execute the query for yesterday's data
                connection.query(yesterdayQuery, (errorYesterday, resultsYesterday) => {

                    if (errorYesterday) {
                        console.error('Error executing yesterday\'s query:', errorYesterday);
                        throw errorYesterday;
                    }

                    // Process the results and calculate the percentage difference
                    resultsToday.forEach((rowToday) => {
                        const user_id = rowToday.user_id;
                        const user_name = rowToday.name;
                        const messagesSentToday = rowToday.messages_sent_today;

                        // Find the corresponding row in yesterday's results
                        const rowYesterday = resultsYesterday.find((row) => row.user_id === user_id);

                        if (rowYesterday) {
                            const messagesSentYesterday = rowYesterday.messages_sent_yesterday;

                            // Calculate the percentage difference
                            const percentageDifference = ((messagesSentToday - messagesSentYesterday) / messagesSentYesterday) * 100;

                            message += `- ${user_name} ha 💩 ${messagesSentToday} ${(messagesSentToday == 1) ? 'volta' : 'volte'}. ${(percentageDifference > 0) ? '📈' : (percentageDifference < 0) ? '📉' : '🟰'}${percentageDifference}%.\n`

                        } else {
                            message += `- ${user_name} ha 💩 ${messagesSentToday} volte. 📈100%.\n`
                        }
                    });

                    
                    console.log(message);

                    // Send the message to the specified chat ID
                    bot.sendMessage(chatId, message)
                        .then(() => console.log('Daily message sent successfully'))
                        .catch(error => console.error('Error sending daily message:', error));
                                    });
            } catch (error) {
                console.log(error);
            }

        });
    });
    // Close the database connection
    connection.release();

});

// // Weekly summary
// // possibili idee: classifica all time, numero di messaggi al giorno di media
// cron.schedule('43 15 * * *', async () => {

// });


// Handle database errors
pool.on('error', (err) => {
    console.error('Database pool error:', err);
});