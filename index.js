import axios from "axios";

// Configuration
let pollingRate = 1000 // DO NOT CHANGE THIS! This is meant to be changed to the time remaining before the next song is played.
let apiKey = "kglk" // LDRHub API Key. Usually the station's callsign.
let matches = 0
let artistList = []

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

var tree = grid.set(0, 1, 1, 1, contrib.tree, { bg: 'green', label: 'Song List' })

var markdown = grid.set(1, 0, 1, 1, contrib.markdown, { label: 'Song Details' })

//allow control the table with the keyboard
tree.focus()

// Set some default data
tree.setData(
    {
        extended: true,
        children: {
            [apiKey]: {
                children: {
                    'JOURNEY': {
                        children: {
                            'Seperate Ways': { name: 'Seperate Ways' }
                        }
                    }
                }
            }
        }
    })

screen.key(['escape', 'q', 'C-c'], function (ch, key) {
    log.log(`Saving results.`)
    return process.exit(0)
});


screen.render()

log.log('\x1b[36m=== JourneyFind ===')
log.log(`\x1b[36m=== Started at \x1b[1m${new Date().toISOString()}\x1b[0m\x1b[36m ===`)
log.log(`\x1b[36m=== Station: \x1b[1m${apiKey}\x1b[0m\x1b[36m ===`);

// Function for looping
function loop() {
    setTimeout(async () => {
        log.log('\x1b[90mFetching current song......')
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

                // If we're at this point; compare playing artist to target.
                artistList.push([now_playing.artist])
                await table.setData(
                    {
                        headers: ['Artist', 'Matches']
                        , data: artistList
                    })
                // if (now_playing.artist === artistName) {
                //     log.log(`\x1b[32mMatch detected! ${artistName} is currently playing on ${apiKey}!`);
                //     await table.setData(
                //         { headers: ['Artist', 'Matches']
                //         , data:
                //             [ [artistName, matches+1]]})
                // } else {
                //     log.log(`\x1b[33m${artistName} is not playing on ${apiKey}; ${now_playing.artist} is.`);
                // }

                // Set the details box.
                markdown.setMarkdown(`${now_playing.title} - ${now_playing.artist} in ${now_playing.album_name}`)

                // Wait for the song to finish playing, and then scan again when the next one starts.
                log.log(`\x1b[35mWaiting ${now_playing.seconds_left * 1000} ms for the song to finish playing.`)
                pollingRate = now_playing.seconds_left * 1000
                loop()
            })
            .catch((e) => {
                log.log(`\x1b[31mFailed to get the current playing song: ${e}`)
            })
    }, pollingRate)
}

loop()