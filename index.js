import axios from "axios";
import fs from "fs";
import jimp from 'jimp'
import path from "path";
import blessed from 'blessed'
import contrib from 'blessed-contrib'
import chalk from 'chalk'
import { MongoClient } from 'mongodb';
import DiscordRPC from 'discord-rpc';
const secrets = JSON.parse(fs.readFileSync('./secrets.json'));

// Configuration
let pollingRate = 1000 // DO NOT CHANGE THIS! This is meant to be changed to the time remaining before the next song is played.
let extraPollingDelay = 8000 // Extra time to add onto the timer for pulling the next song. Hacky solution to prevent songs from duping in the tree.
let apiKey = "kglk" // LDRHub API Key. Usually the station's callsign.
let rpcClientId = '997179375105613864'; // The Discord Client ID to use with Rich Presence.

// Leave this alone.
let artistList = {}
let isPresenceActive = false;

// Create the RPC client.
const rpc = new DiscordRPC.Client({ transport: 'ipc' });

// Create the screen, and the grid for it
let screen = blessed.screen()
let grid = new contrib.grid({ rows: 2, cols: 2, screen: screen })

// Build the elements for the UI:
//  - The log, for displaying status messages.
//  - The tree, for displaying the artist list.
//  - The cover art box (picture), for displaying the cover art in ASCII.
//  - The song log, for displaying the song history.
var log = grid.set(0, 0, 1, 1, contrib.log,
    {
        style:
        {
            text: "green"
            , baseline: "black"
        }
        , xLabelPadding: 3
        , xPadding: 5
        , label: 'Log'
    })
var tree = grid.set(0, 1, 1, 1, contrib.tree, { fg: 'green', label: 'Song List' })
var coverart = grid.set(1, 0, 1, 1, contrib.picture, {
    file: './assets/missing_cover.png',
    cols: 54,
    onReady: function () {
        screen.render()
    }
})
var songlog = grid.set(1, 1, 1, 1, contrib.log,
    {
        style:
        {
            text: "green"
            , baseline: "black"
        }
        , xLabelPadding: 3
        , xPadding: 5
        , label: 'Song History'
    })

// Make the tree interactive.
tree.focus()

// Set the window title, and render!
screen.title = 'JourneyJourney'
screen.render()
log.log(chalk.cyan('=== JourneyJourney - Press h for help ==='))

// Define interactive keyboard controls.

// Keyboard control for showing help information.
screen.key(['h'], async function (ch, key) {
    log.log('')
    log.log(chalk.cyan('=== q - exit ==='))
    log.log(chalk.cyan('=== c - clear logs ==='));
    log.log(chalk.cyan('=== shift+c - clear tree ==='));
    log.log(chalk.cyan('=== h - show this menu ==='));
});

// Keyboard control for quitting.
screen.key(['q'], async function (ch, key) {
    // Clear the cache folder (holds the cover art images)
    fs.readdir('./cache/', (err, files) => {
        console.log(files)
        if (files.length === 0) {
            screen.destroy()
            database.close();
            console.log(chalk.cyan('The cache was not wiped, as it was already empty.'))
            return process.exit(0)
        } else {
            log.log(chalk.gray('Wiping the cache folder...'))
            for (const file of files) {
                fs.unlink(path.join('./cache/', file), err => {
                    screen.destroy()
                    database.close();
                    return process.exit(0)
                });
            }
        }
    });
});

// Keyboard control for clearing the logs.
screen.key(['c'], async function (ch, key) {
    // Recreate log and songlog objects
    log = grid.set(0, 0, 1, 1, contrib.log,
        {
            style:
            {
                text: "green"
                , baseline: "black"
            }
            , xLabelPadding: 3
            , xPadding: 5
            , label: 'Log'
        })
    songlog = grid.set(1, 1, 1, 1, contrib.log,
        {
            style:
            {
                text: "green"
                , baseline: "black"
            }
            , xLabelPadding: 3
            , xPadding: 5
            , label: 'Song History'
        })
    return screen.render();
});

// Keyboard control for clearing the tree.
screen.key(['S-c'], async function (ch, key) {
    artistList = {}
    updateTree();
    return screen.render();
});

// Define some functions.
function updateTree() {
    tree.setData(
        {
            extended: true,
            children: {
                [apiKey]: {
                    extended: true,
                    children: artistList
                    // === Format ===
                    // 'JOURNEY': {
                    //     children: {
                    //         'Seperate Ways': { name: 'Seperate Ways' }
                    //     }
                    // }
                }
            }
        }
    )
}

async function setCoverArt(artUrl, id) {
    // The cover art URLs that LDRHub provides are in JPG, which blessed doesn't seem to like.
    // We need to convert them to PNG before we can display them.
    // The following code will:
    //  - Download the cover art from LDRHub (500x500 atm)
    //  - Converts the downloaded image data to PNG
    //  - Recreates the cover art box with the new cover art file
    await jimp.read(artUrl)
        .then(cover => {
            cover.write(`./cache/${id}.png`, () => {
                return coverart.setImage({
                    file: `./cache/${id}.png`,
                    cols: 54,
                    onReady: function () {
                        screen.render()
                    }
                })
            }); // save
        })
}

// Initialize the database.
log.log(chalk.gray('Initializing database...'))
let database = await MongoClient.connect(secrets.mongoUri, { useNewUrlParser: true })
    .then((db) => {
        log.log(chalk.greenBright('Successfully established connection with MongoDB!'))
        log.log(chalk.greenBright('Repopulating tree. This may take a while...'))
        // Get EVERY song from the collection.
        db.db('jj').collection('songs').find({}).toArray((err, results) => {
            // For each song returned, add it to the tree.
            results.forEach(item => {
                // If the artist doesn't yet exist in the local tree object, create it.
                if (!artistList[item.artist]) {
                    artistList[item.artist] = {
                        children: {}
                    }
                }
                // Add the song to the artist's list of songs.
                Object.assign(artistList[item.artist].children, {
                    [item.npTimestamp]: { name: item.title }
                })
                // Add the song to the song log.
                var songPlayedTimestamp = new Date(item.npTimestamp * 1000).toLocaleString();
                songlog.log(chalk.cyan(`[${chalk.cyanBright(songPlayedTimestamp)}] - ${item.title} - ${item.artist}`))
                // Log the added song.
                log.log(chalk.gray(`    - ${item.title} by ${item.artist} at ${item.npTimestamp} on ${item.station}`))
            })
            // Report back how many songs were found and readded. Also add a marker to the song log.
            log.log(chalk.greenBright(`Repopulated ${results.length} songs into the tree!`))
            songlog.log(chalk.yellow(`=== Beginning of songs captured this session ===`))
            // Tell the tree to update and show the added songs.
            updateTree();
        })
        // Return the database object. This allows for it to be used in the loop function.
        return db;
    })
    .catch((e) => {
        log.log(chalk.redBright(`Failed to connect to the database:`))
        log.log(chalk.redBright(`${e}`))
        log.log(chalk.redBright(chalk.italic(`Tree data will not be saved!`)))
    })

// Initialize Discord RPC.
log.log(chalk.gray('Initializing rich presence...'))
await rpc.login({ clientId: rpcClientId })
    .then(() => {
        log.log(chalk.greenBright('Successfully logged into Discord RPC!'))
        isPresenceActive = true
        rpc.setActivity({
            details: 'Waiting for a song...',
            state: `Listening on ${apiKey.toUpperCase()}`,
            instance: false,
        });
    }).catch(e => {
        log.log(chalk.redBright(`Failed to log into Discord RPC:`))
        log.log(chalk.redBright(`${e}`))
    })

function loop() {
    setTimeout(async () => {
        log.log(chalk.gray('Fetching current song...'))
        await axios.get(`https://api.ldrhub.com/2/?key=${apiKey}&method=Station.Engage.NowPlaying`)
            .then(async (r) => {
                // Not needed but makes this all cleaner
                let now_playing = r.data["Station.Engage.NowPlaying"].now_playing
                // Check if now_playing is null (an ad may be playing, or the station is processing new player data)
                if (now_playing === null) {
                    log.log(chalk.yellowBright('An ad is playing, or the station is still processing. Waiting 15 seconds...'))
                    // Set presence.
                    if (isPresenceActive === true) {
                        rpc.setActivity({
                            details: `Waiting for ads to finish...`,
                            state: `Live on ${apiKey.toUpperCase()}`,
                            instance: false,
                        });
                    }

                    // Wait 10 more seconds before retrying
                    pollingRate = 15000
                    return loop()
                }
                // Create a skeleton object for the artist in case it does not exist yet
                if (!artistList[now_playing.artist]) {
                    artistList[now_playing.artist] = {
                        children: {}
                    }
                }
                Object.assign(artistList[now_playing.artist].children, {
                    [now_playing.system_timestamp]: { name: now_playing.title }
                })
                // Insert a record into the database
                database.db('jj').collection('songs').find({ npTimestamp: now_playing.system_timestamp }).toArray(function (err, result) {
                    if (err) throw err;
                    if (result.length !== 0) {
                        log.log(chalk.gray('This song appearance already exists in the database.'))
                    } else {
                        database.db('jj').collection('songs').insertOne({
                            station: apiKey,
                            artist: now_playing.artist,
                            npTimestamp: now_playing.system_timestamp,
                            title: now_playing.title
                        }, (err, res) => {
                            if (err) {
                                log.log(chalk.redBright(`Failed to insert song into database:`))
                                log.log(chalk.redBright(`${err}`))
                            } else {
                                log.log(chalk.greenBright(`Successfully inserted song into database!`))
                                log.log(JSON.stringify(res))
                            }
                        })
                    }
                });

                updateTree();
                // Add song to the history log
                var songPlayedTimestamp = new Date(now_playing.system_timestamp * 1000).toLocaleString();
                songlog.log(chalk.green(`[${chalk.greenBright(songPlayedTimestamp)}] - ${now_playing.title} - ${now_playing.artist}`))
                setCoverArt(now_playing.album_art, now_playing.id);
                // Set presence.
                if (isPresenceActive === true) {
                    rpc.setActivity({
                        details: `${now_playing.title} by ${now_playing.artist}`,
                        state: `Live on ${apiKey.toUpperCase()}`,
                        instance: false,
                    });
                }
                // Wait for the song to finish playing, and then scan again when the next one starts.
                log.log(chalk.magentaBright(`Waiting ${now_playing.seconds_left * 1000} (+ ${extraPollingDelay}) ms for the song to finish playing.`))
                pollingRate = (now_playing.seconds_left * 1000) + extraPollingDelay
                loop()
            })
            .catch((e) => {
                log.log(chalk.redBright(`Failed to get the current playing song:`))
                log.log(chalk.redBright(`${e}`))
                log.log(chalk.redBright(`Waiting 30 seconds before trying again.`))
                pollingRate = 30000
                loop()
            })
    }, pollingRate)
}

// Start the loop.
loop()