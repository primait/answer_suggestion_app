(function() {
  return {
    doneLoading: false,
    entries: [],
    executedSearch: 0,
    searchToBeExecuted: 1,
    defaultNumberOfEntriesToDisplay: 10,

    events: {
      // APP EVENTS
      'app.activated'                           : 'initializeIfReady',
      'ticket.status.changed'                   : 'initializeIfReady',
      'ticket.subject.changed'                  : _.debounce(function(){
        this.initialize();
      }, 500),
      // AJAX EVENTS
      'search.done'                             : 'searchDone',
      // DOM EVENTS
      'click,dragend ul.entries a.copy_link'    : function(event){
        event.preventDefault();

        return this.appendToComment(this.$(event.currentTarget).prop('href'));
      },
      'keyup .custom-search input'              : function(event){
        if(event.keyCode === 13)
          return this.customSearch();
      },
      'click .custom-search button'             : 'customSearch'
    },

    requests: {
      search: function(query){
        return {
          url: '/api/v2/search.json?query=type:topic ' + query,
          type: 'GET'
        };
      }
    },

    initializeIfReady: function(){
      if (this.canInitialize()){
        this.initialize();
        this.doneLoading = true;
      }
    },

    canInitialize: function(){
      return (!this.doneLoading &&
              this.ticket());
    },

    initialize: function(){
      if (_.isEmpty(this.ticket().subject()))
        return this.switchTo('no_subject');

      this.entries = [];
      this.executedSearch = 0;
      this.searchToBeExecuted = 1;

      if (!_.isEmpty(this.ticket().tags())){
        this.searchToBeExecuted = 2;
        this.ajax('search', this.tagsSearchQuery());
      }

      return this.ajax('search', this.subjectSearchQuery());
    },

    customSearch: function(){
      this.searchToBeExecuted = 1;
      this.entries = [];
      this.executedSearch = 0;

      this.ajax('search', this.$('.custom-search input').val());
    },

    searchDone: function(data) {
      this.executedSearch++;
      this.addEntry(data.results);

      if (this.executedSearch == this.searchToBeExecuted &&
          _.isEmpty(this.entries))
        return this.switchTo('no_entries');

      return this.switchTo('list', {
        entries: _.reduce(this.entries.slice(0,this.numberOfDisplayableEntries()),
                          function(memo, entry){
                            memo.push({
                              id: entry.id,
                              url: this.baseUrl() + "entries/" + entry.id,
                              title: entry.title
                            });
                            return memo;
                          }, [], this)
      });
    },

    baseUrl: function(){
      if (this.setting('custom_host'))
        return this.setting('custom_host');
      return "https://" + this.currentAccount().subdomain() + ".zendesk.com/";
    },

    appendToComment: function(text){
      var old_text = _.isEmpty(this.comment().text()) ? '' : this.comment().text() + '\n';
      return this.comment().text( old_text + text);
    },

    stop_words: _.memoize(function(){
      return _.map(this.I18n.t("stop_words").split(','), function(word) { return word.trim(); });
    }),

    numberOfDisplayableEntries: function(){
      return this.setting('nb_entries') || this.defaultNumberOfEntriesToDisplay;
    },

    // extracted from http://geeklad.com/remove-stop-words-in-javascript
    removeStopWords: function(str, stop_words){
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
    },

    subjectSearchQuery: function(s){
      return this.removeStopWords(this.ticket().subject(), this.stop_words());
    },

    tagsSearchQuery: function(){
      return _.reduce(this.ticket().tags(),
                      function(memo, tag){
                        memo.push('tags:'+tag);
                        return memo;
                      },
                      []).join(' ');
    },

    addEntry: function(entries){
      var new_entries = _.union(this.entries, entries);

      this.entries = _.uniq(new_entries, true, function(i){return i.id;});

      return this.entries;
    }
  };
}());
