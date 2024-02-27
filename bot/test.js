const mysql = require("mysql");

require("dotenv").config();

// Create a connection to the MariaDB database
const pool = mysql.createPool({
    host: process.env.dbHost, // Change this to your MariaDB host
    port: process.env.dbPort,
    user: process.env.dbUser, // Change this to your MariaDB username
    password: process.env.dbPassword, // Change this to your MariaDB password
    database: "cacca", // Change this to your MariaDB database name
    keepAlive: true,
    keepAliveInitialDelay: 30000, // 30 seconds
});

function test() {
    let message = "I cagoni di oggi: \n";

    // Acquire a connection from the pool
    pool.getConnection((err, connection) => {
        if (err) {
            console.error("Error getting connection from pool:", err);
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
            SELECT user_id AS messages_sent_yesterday
            FROM messages
            WHERE message_date = CURRENT_DATE - INTERVAL 1 DAY
            GROUP BY user_id
            ORDER BY messages_sent_yesterday DESC;
            `;

        const countResultsQuery = `SELECT count(*) as totale from messages`;

        // Execute the query for today's data
        connection.query(todayQuery, (errorToday, resultsToday) => {
            if (errorToday) throw error;

            // Execute the query for yesterday's data
            connection.query(yesterdayQuery, (errorYesterday, resultsYesterday) => {
                if (errorYesterday) throw error;

                connection.query(countResultsQuery, (errorCountResults, resultsCountResults) => {
                    if (errorCountResults) throw error;

                    const results = resultsCountResults[0].totale

                    // Process the results and calculate the percentage difference
                    resultsToday.forEach((rowToday) => {
                        const user_id = rowToday.user_id;
                        const user_name = rowToday.name;
                        const messagesSentToday = rowToday.messages_sent_today;

                        // Find the corresponding row in yesterday's results
                        const rowYesterday = resultsYesterday.find(
                            (row) => row.user_id === user_id
                        );

                        if (rowYesterday) {
                            const messagesSentYesterday = rowYesterday.messages_sent_yesterday;

                            // Calculate the percentage difference
                            const percentageDifference = ((messagesSentToday - messagesSentYesterday) / messagesSentYesterday) * 100;

                            message += `- ${user_name} ha 💩 ${messagesSentToday} ${(messagesSentToday == 1) ? 'volta' : 'volte'}. ${(percentageDifference > 0) ? '📈' : (percentageDifference < 0) ? '📉' : '🟰'}${percentageDifference}%.\n`

                        } else {
                            message += `- ${user_name} ha 💩 ${messagesSentToday} volte. 📈100%.\n`
                        }

                    });
                    //message += `Sono state effettuate ${results} cagate.`;
                });

                console.log(message);

            });
        });
        // Close the database connection
        connection.release();
    });
}

test();
