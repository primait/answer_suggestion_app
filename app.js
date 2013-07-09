(function() {

  return {
    doneLoading: false,
    defaultState: 'spinner',
    defaultNumberOfEntriesToDisplay: 10,

    events: {
      // APP EVENTS
      'app.activated'                           : 'initializeIfReady',
      'ticket.status.changed'                   : 'initializeIfReady',
      'ticket.subject.changed'                  : _.debounce(function(){
        this.initialize();
      }, 500),
      // AJAX EVENTS
      'search.done'                             : 'preSearchDone',
      'fetchTopics.done'                        : 'searchDone',
      // DOM EVENTS
      'click,dragend ul.entries a.copy_link'    : 'copyLink',
      'keyup .custom-search input'              : function(event){
        if(event.keyCode === 13)
          return this.customSearch();
      },
      'click .custom-search button'             : 'customSearch'
    },

    requests: {
      search: function(query){
        this.switchTo('spinner');
        return {
          url: this.apiEndpoint() + 'search.json?query=type:topic ' + query,
          type: 'GET'
        };
      },

      fetchTopics: function(ids){
        return {
          url: this.apiEndpoint() + 'topics/show_many.json?ids=' + ids.join(',') + '&include=forums',
          type: 'POST'
        };
      }
    },

    searchUrlPrefix: _.memoize(function() {
      return this.setting('search_hc') ? '/hc' : '';
    }),

    apiEndpoint: _.memoize(function(){
      return this.searchUrlPrefix() + '/api/v2/';
    }),

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

      return this.ajax('search', this.subjectSearchQuery());
    },

    customSearch: function(){
      this.ajax('search', this.$('.custom-search input').val());
    },

    preSearchDone: function(data) {
      if (_.isEmpty(data.results))
        return this.switchTo('no_entries');

      return this.ajax('fetchTopics', _.map(data.results,
                                            function(topic) { return topic.id; }));
    },

    searchDone: function(data){
      var formatted_results = this.formatSearchResults(data);

      if (_.isEmpty(formatted_results.entries))
        return this.switchTo('no_entries');

      this.switchTo('list', formatted_results);

      this.$('a').tooltip({
        trigger: 'hover',
        placement: 'left'
      });
    },

    formatSearchResults: function(result){
      var entries = _.inject(result.topics, function(memo, entry){

        var forum = _.find(result.forums, function(f){ return f.id == entry.forum_id; });
        var formatted_entry = {
          id: entry.id,
          url: this.baseUrl() + this.articlePath(entry.id),
          title: entry.title || entry.name,
          preview: this.truncate(entry.body, 100),
          truncated_title: this.truncate(entry.title),
          agent_only: !!forum.access.match("agents only")
        };

        if ( !(this.setting('exclude_agent_only') && formatted_entry.agent_only)){
          memo.push(formatted_entry);
        }

        return memo;
      }, [], this);

      return { entries: entries.slice(0,this.numberOfDisplayableEntries()) };
    },

    baseUrl: function(){
      if (this.setting('custom_host'))
        return this.setting('custom_host');
      return "https://" + this.currentAccount().subdomain() + ".zendesk.com/";
    },


    articlePath: function(articleId) {
      if (this.setting('search_hc')) {
        return 'hc/articles/' + articleId;
      } else {
        return 'entries/' + articleId;
      }
    },

    truncate: function(str, custom_limit){
      var limit = custom_limit|45;

      if (str.length < limit)
        return str;
      return str.slice(0,limit) + '...';
    },

    copyLink: function(event){
      event.preventDefault();
      var content = "";

      if (this.setting('include_title')) { content = event.currentTarget.title + ' - '; }

      content += event.currentTarget.href;

      return this.appendToComment(content);
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
    }
  };
}());
