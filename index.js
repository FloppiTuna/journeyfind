import axios from "axios";

// Configuration
let pollingRate = 1000 // DO NOT CHANGE THIS! This is meant to be changed to the time remaining before the next song is played.
let apiKey = "kglk" // LDRHub API Key. Usually the station's callsign.
let artistList = {}

// Make UI
import blessed from 'blessed'
import contrib from 'blessed-contrib'

let screen = blessed.screen()
let grid = new contrib.grid({ rows: 2, cols: 2, screen: screen })

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

var markdown = grid.set(1, 0, 1, 1, contrib.markdown, { label: 'Song Details' })

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

//allow control the table with the keyboard
tree.focus()

screen.key(['escape', 'q', 'C-c'], function (ch, key) {
    log.log(`Saving results.`)
    return process.exit(0)
});

screen.render()

log.log('\x1b[36m=== JourneyFind ===')
log.log(`\x1b[36m=== Started at \x1b[1m${new Date().toISOString()}\x1b[0m\x1b[36m ===`)
log.log(`\x1b[36m=== Station: \x1b[1m${apiKey}\x1b[0m\x1b[36m ===`);
songlog.log(`\x1b[36m=== Beginning of History ===`)

// Functions
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

function loop() {
    setTimeout(async () => {
        log.log('\x1b[90mFetching current song...')
        await axios.get(`https://api.ldrhub.com/2/?key=${apiKey}&method=Station.Engage.NowPlaying`)
            .then(async (r) => {
                // Not needed but makes this all cleaner
                let now_playing = r.data["Station.Engage.NowPlaying"].now_playing
                // Check if now_playing is null (an ad may be playing, or the station is processing new player data)
                if (now_playing === null) {
                    log.log('\x1b[33mAn ad is playing, or the station is still processing. Waiting 15 seconds...')
                    markdown.setMarkdown(`\x1b[5m\x1b[33mStation is processing`)
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
                updateTree();
                // Set the details box.
                markdown.setMarkdown(`${now_playing.title} - ${now_playing.artist} in ${now_playing.album_name}`)
                // Add song to the history log
                var songPlayedTimestamp = new Date(now_playing.system_timestamp * 1000).toLocaleString();
                songlog.log(`\x1b[32m[\x1b[1m${songPlayedTimestamp}\x1b[0m\x1b[32m] - ${now_playing.title} - ${now_playing.artist}`)
                // Wait for the song to finish playing, and then scan again when the next one starts.
                log.log(`\x1b[35mWaiting ${now_playing.seconds_left * 1000} ms for the song to finish playing.`)
                pollingRate = now_playing.seconds_left * 1000
                loop()
            })
            .catch((e) => {
                log.log(`\x1b[31mFailed to get the current playing song:`)
                log.log(`\x1b[31m${e}`)
                log.log(`\x1b[31mWaiting 30 seconds before trying again.`)
                pollingRate = 30000
                loop()
            })
    }, pollingRate)
}

loop()