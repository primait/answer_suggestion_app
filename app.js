(function() {
  // extracted from http://geeklad.com/remove-stop-words-in-javascript
  function removeStopWords(str, stop_words){
    var words = str.match(/[^\s]+|\s+[^\s+]$/g);
    var x,y = 0;

    for(x=0; x < words.length; x++) {
      // For each word, check all the stop words
      for(y=0; y < stop_words.length; y++) {
        // Get the current word
        var word = words[x].replace(/\s+|[^a-z]+\'/ig, "");

        // Get the stop word
        var stop_word = stop_words[y];

        // If the word matches the stop word, remove it from the keywords
        if(word.toLowerCase() == stop_word) {
          // Build the regex
          var regex_str = "^\\s*"+stop_word+"\\s*$";// Only word
          regex_str += "|^\\s*"+stop_word+"\\s+";// First word
          regex_str += "|\\s+"+stop_word+"\\s*$";// Last word
          regex_str += "|\\s+"+stop_word+"\\s+";// Word somewhere in the middle

          var regex = new RegExp(regex_str, "ig");

          str = str.replace(regex, " ");
        }
      }
    }
    // Remove punctuation and trim
    return str.replace(/[\!\?\,\.\;]/g,"")
      .replace(/^\s+|\s+$/g, "");
  }

  function TicketSerializer(ticket, stop_words){
    this.ticket = ticket;
    this.stop_words = stop_words;

    this.toSubjectSearchQuery = function(){
      return removeStopWords(this.ticket.subject(), this.stop_words);
    };

    this.toTagsSearchQuery = function(){
      return _.reduce(this.ticket.tags(),
                      function(memo, tag){
                        memo.push('tags:'+tag);
                        return memo;
                      },
                      []).join(' ');
    };
  }

  function EntriesSerializer(entries, baseUrl){
    this.entries = entries;
    this.baseUrl = baseUrl;

    this.toList = function(){
      return _.reduce(this.entries, function(memo, entry){
        memo.push({
          id: entry.id,
          url: this.baseUrl + "entries/" + entry.id,
          title: entry.title
        });
        return memo;
      }, [], this);
    };
  }

  function EntrySet() {
    this.self = [];

     this.push = function(array) {
      var newSelf = _.union(this.self, array);

      this.self = _.uniq(newSelf, true, function(i){return i.id;});

      return this.self;
    };

    this.toArray = function(){ return this.self; };
  }

  return {
    doneLoading: false,
    entries: new EntrySet(),
    executedSearch: 0,
    searchToBeExecuted: 1,
    defaultNumberOfEntriesToDisplay: 10,

    events: {
      // APP EVENTS
      'app.activated'                           : 'initializeIfReady',
      'ticket.id.changed'                       : 'initializeIfReady',
      // AJAX EVENTS
      'search.done'                             : 'searchDone',
      // DOM EVENTS
      'click,dragend ul.entries a.copy_link'    : function(event){
        event.preventDefault();

        return this.appendToComment(this.$(event.currentTarget).prop('href'));
      }
    },

    requests: {
      search: function(query){
        return {
          url: '/api/v2/search.json?query=type:topic ' + query,
          type: 'GET'
        };
      }
    },

    initializeIfReady: function(data){
      if (data.firstLoad &&
          this.canInitialize()){

        this.initialize();
        this.doneLoading = true;
      }
    },

    canInitialize: function(){
      return (!this.doneLoading &&
              this.ticket() &&
              this.ticket().id());
    },

    initialize: function(){
      var serializer = new TicketSerializer(this.ticket(), this.stop_words());

      if (!_.isEmpty(this.ticket().tags())){
        this.searchToBeExecuted = 2;
        this.ajax('search', serializer.toTagsSearchQuery());
      }

      return this.ajax('search', serializer.toSubjectSearchQuery());
    },

    searchDone: function(data) {
      this.executedSearch++;
      this.entries.push(data.results);

      if (this.executedSearch == this.searchToBeExecuted &&
          _.isEmpty(this.entries.toArray()))
        return this.switchTo('no_entries');

      return this.switchTo('list', {
        entries: new EntriesSerializer(this.entries.toArray().slice(0,this.numberOfDisplayableEntries()),
                                       this.baseUrl()).toList()
      });
    },

    baseUrl: function(){
      return "https://" + this.currentAccount().subdomain() + ".zendesk.com/";
    },

    appendToComment: function(text){
      var old_text = _.isEmpty(this.comment().text()) ? '' : this.comment().text() + '\n';
      return this.comment().text( old_text + text);
    },

    stop_words: function(){
      return _.map(this.I18n.t("stop_words").split(','), function(word) { return word.trim(); });
    },

    numberOfDisplayableEntries: function(){
      return this.setting('nb_entries') || this.defaultNumberOfEntriesToDisplay;
    }
  };

}());
