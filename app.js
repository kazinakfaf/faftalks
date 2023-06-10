Vue.config.devtools = true

const App = new Vue({
    el: '#app',
    data: {
        player: {
            id: '',
            name: ''
        },
        status: '',
        searching: false,
        preload_games: [],
        games: [],
        pagination: {
            current: 1,
            size: 150,
            count: 1
        },
        chat_filter_regexp: [
            new RegExp('^sent .* units* to [a-zA-Z0-9-_]+$', 'i'),
            new RegExp('^Sent units to.*$', 'i'),
            new RegExp('^e+$', 'i'),
            new RegExp('^g+$', 'i'),
            new RegExp('^Sent Mass .+ to [a-zA-Z0-9-_]+$', 'i'),
            new RegExp('^Sent .+ mass to [a-zA-Z0-9-_]+$', 'i'),
            new RegExp('^Sent Energy .+ to [a-zA-Z0-9-_]+$', 'i'),
            new RegExp('^Can you give me.*$', 'i'),
            new RegExp('^Sent .+ energy to [a-zA-Z0-9-_]+$', 'i'),
            new RegExp('^.*Give me Energy.*$', 'i')
        ]
    },

    created() {
    },

    computed: {
        paginated() {
            var start = (this.pagination.current - 1) * this.pagination.size; 
            return this.games.slice(start, start + this.pagination.size);
        }
    },

    methods: {
        async search() {
            this.searching = true;
            this.page = 1;
            this.games = [];
            this.pagination.count = 1;
            this.pagination.current = 1;
            this.status = 'Searchig player ...'
            await this.getPlayer();
            if(!this.player.id) {
                this.status = 'Player not found'
                this.searching = false
                return;
            }
            this.status = 'Loading games list ...'
            this.takeGames();
            
        },

        async getPlayer() {
            var player_id = 0;
            await fetch(`https://api.faforever.com/data/player?filter=login%3D%3D%27${this.player.name}%27&page%5Blimit%5D=1`)
            .then((response) => response.json())
            .then((json) => {
                if(json.data.length == 1) {
                    player_id = json.data[0].id;
                }
            });
            this.player.id = player_id; 
        },

        takeGames(page_number = 1) {
            const page_size = 500; 
            fetch(`https://api.faforever.com/data/game?filter=replayAvailable==True%20and%20playerStats.player.id%3D%3D${this.player.id}&page[number]=${page_number}&page[size]=${page_size}&page[totals]=yes&sort=-id`)
            .then((response) => response.json())
            .then((data) => {
                if(!this.searching) {
                    this.status = `Stoped`;
                    return;
                }
                data.data.forEach(game => {
                    this.preload_games.push({
                        id: game.id,
                        name: game.attributes.name,
                        replayUrl: game.attributes.replayUrl,
                        chat: [],
                        chatall: false 
                    });
                });
                if(page_number < data.meta.page.totalPages) {
                    this.status = `Loading games list ${this.preload_games.length}/${data.meta.page.totalRecords}`;
                    this.takeGames(page_number + 1);
                } else {
                    this.status = `Starting replay parsing`;
                    this.workWithReplays();
                }
            });
        },

        async workWithReplays() {
            for (var i = 0; i < this.preload_games.length; i++) {
                var game = this.preload_games[i];
                this.status = `Parsing game replay ${i+1}/${this.preload_games.length}`;
                var replay = null
                try {
                    await this.sleep(200); // error replay load without this
                    await this.loadReplay(game.replayUrl).then(value => replay = value);
                    game.chat = replay.chat.filter(this.chatFilter);
                    game.own_messages_count = this.getOwnMessagesCount(game); // for not show game if player have 0 messages in chat
                    if(game.own_messages_count > 0) {
                        this.games.push(game)
                        this.pagination.count = Math.floor(this.games.length / this.pagination.size) + 1
                    }
                } catch (error) {
                    console.log(error);
                    alertify.error(`Eror loading replay ${game.id}`);
                }
                if(!this.searching) {
                    this.status = `Stoped`;
                    break
                }
            }
            this.preload_games = [];
            if (this.status != `Stoped`) this.status = `THE END`;
        },

        async loadReplay(url) {
            var data = await this.readFileAsync(url);
            var splitindex = data.indexOf(10);
            var fafinfo = JSON.parse(new TextDecoder().decode(data.slice(0, splitindex)));
            var compressed = data.slice(splitindex + 1);
            var decompressed = fzstd.decompress(compressed);
            var replay = ReplayParser(decompressed);
            replay['fafinfo'] = fafinfo;
            return replay;
        },

        async readFileAsync(url) {
            var urlData = null;

            await fetch(url)
            .then((response) => response.blob())
            .then((data) => {urlData = data; });

            var arrayBuffer = null;

            await new Promise((resolve, reject) => {
              let reader = new FileReader();
          
              reader.onload = () => {
                resolve(reader.result);
              };
          
              reader.onerror = reject;
          
              reader.readAsArrayBuffer(urlData);
            }).then((value) => arrayBuffer = value);

            return new Uint8Array(arrayBuffer);
        },

        sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        },

        chatFilter(msg) {
            var filtered = false
            this.chat_filter_regexp.every(regexp => {
                if(regexp.test(msg.text) ) {
                    filtered = true
                    return false;
                }
                return true;
            });
            return !filtered
        },

        getMessageView(game, msg) {
            if (!game.chatall) return this.player.id == msg.player_id 
            return true
        },

        getOwnMessagesCount(game) {
            count = 0
            game.chat.forEach(msg => {
                if(this.player.id == msg.player_id) count++
                
            });
            return count;
        },

        goToPage(page_index) {
            this.pagination.current = page_index;
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        
    }


    
});