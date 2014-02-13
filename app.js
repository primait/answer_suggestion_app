(function() {
  return {
    defaultState: 'spinner',
    defaultNumberOfEntriesToDisplay: 10,
    events: {
      // APP EVENTS
      'app.activated': 'activated',
      'ticket.subject.changed': _.debounce(function(){ this.initialize(); }, 500),

      // AJAX EVENTS
      'search.done': 'searchDone',
      'getTopicContent.done': 'topicContentDone',
      'getHCArticleContent.done': 'hcArticleContentDone',
      'settings.done': 'settingsDone',
      'getMacroContent.done': 'macroContentDone',

      // DOM EVENTS
      'click a.preview_link': 'previewLink',
      'dragend,click a.copy_link': 'copyLink',
      'dragend a.main': 'copyLink',
      'click .toggle-app': 'toggleAppContainer',
      'keyup .custom-search input': function(event){
        if(event.keyCode === 13)
          return this.processSearchFromInput();
      },
      'click .custom-search button': 'processSearchFromInput'
    },

    requests: {
      settings: {
        url: '/api/v2/account/settings.json',
        type: 'GET'
      },

      getTopicContent: function(id) {
        return {
          url: helpers.fmt('/api/v2/topics/%@.json', id),
          type: 'GET'
        };
      },

      getHCArticleContent: function(url) {
        return {
          url: url,
          type: 'GET',
          dataType: 'html'
        };
      },

      getMacroContent: function() {
        return {
          url: '/api/v2/macros.json',
          type: 'GET'
        };
      },

      search: function(query){
        this.switchTo('spinner');
        console.log(query);
        this.query = query;
        this.results = { entries: [], macros: [] };
        var topic = this.setting('search_hc') ? '' : ' type:topic';
        return {
          url: helpers.fmt('%@search.json?query=%@%@', this.apiEndpoint(), query, topic),
          type: 'GET',
          proxy_v2: true
        };
      },

      fetchTopicsWithForums: function(ids){
        return {
          url: helpers.fmt("/api/v2/topics/show_many.json?ids=%@&include=forums", ids.join(',')),
          type: 'POST',
          proxy_v2: true
        };
      }
    },

    searchUrlPrefix: _.memoize(function() {
      return this.setting('search_hc') ? '/hc' : '';
    }),

    apiEndpoint: _.memoize(function(){
      return helpers.fmt("%@/api/v2/", this.searchUrlPrefix());
    }),

    activated: function(app){
      if (app.firstLoad)
        return this.initialize();
    },

    initialize: function(){
      if (_.isEmpty(this.ticket().subject()))
        return this.switchTo('no_subject');
      this.ajax('settings').then(function() {
        this.ajax('search', this.subjectSearchQuery());
      }.bind(this));
    },

    settingsDone: function(data) {
      this.useMarkdown = data.settings.tickets.markdown_ticket_comments;
    },

    topicContentDone: function(data) {
      this.$('#detailsModal .modal-body').html(data.topic.body);
    },

    hcArticleContentDone: function(data) {
      var html = this.$(data).find('.article-body').html();
      this.$('#detailsModal .modal-body').html(html);
    },

    macroContentDone: function(data) {
      if (data.count > 0) {
        var queryWords = this.query.split(' ');
        var macros = data.macros.filter(function(macro) {
          macro.relevance = 0;
          queryWords.reduce(function(memo, word) { 
            if (macro.title.toLowerCase().indexOf(word.toLowerCase()) !== -1 && word !== "") {
              macro.relevance++;
            }
          }, macro.relevance);
          return macro.relevance > 0;
        });
        if (macros.length) {
          macros = _.sortBy(macros, 'relevance').reverse();
          this.results.macros = macros;
        }
        this.renderList(this.results);
      } 
    },

    searchDone: function(data){
      if (_.isEmpty(data.results)){
        this.searchForMacros();
        return;
      }

      if (this.setting('search_hc')){
        this.results.entries = this.formatHcEntries(data.results);
        this.searchForMacros();
      } else {
        var topics = data.results;

        this.ajax('fetchTopicsWithForums', _.map(topics, function(topic) { return topic.id; }))
          .done(function(data){
            this.results.entries = this.formatEntries(topics, data);
            this.searchForMacros();
          });
      }
    },

    searchForMacros: function() {
      if (!this.setting('search_macros')) {
        return this.renderList(this.entries);
      }
      this.ajax('getMacroContent');
    },

    renderList: function(data){
      if (_.isEmpty(data.entries) && _.isEmpty(data.macros))
        return this.switchTo('no_entries');

      this.switchTo('list', data);
    },

    formatEntries: function(topics, result){
      var entries = _.inject(topics, function(memo, topic){
        var forum = _.find(result.forums, function(f){ return f.id == topic.forum_id; });
        var entry = {
          id: topic.id,
          url: helpers.fmt("%@entries/%@", this.baseUrl(), topic.id),
          title: topic.title,
          agent_only: !!forum.access.match("agents only")
        };

        if ( !(this.setting('exclude_agent_only') && entry.agent_only)){
          memo.push(entry);
        }

        return memo;
      }, [], this);

      return { entries: entries.slice(0,this.numberOfDisplayableEntries()) };
    },

    formatHcEntries: function(result){
      var slicedResult = result.slice(0, this.numberOfDisplayableEntries());
      var entries = _.inject(slicedResult, function(memo, entry){
        var title = entry.name;
        var url = entry.html_url.replace(/^https:\/\/.*.zendesk.com\//, this.baseUrl());

        memo.push({
          id: url,
          url: url,
          title: title
        });
        return memo;
      }, [], this);

      return { entries: entries };
    },

    processSearchFromInput: function(){
      var query = this.removePunctuation(this.$('.custom-search input').val());

      if (!query || !query.length) {
        return;
      }

      this.ajax('search', query);
    },

    baseUrl: function(){
      if (this.setting('custom_host')) {
        var host = this.setting('custom_host');
        if (host[host.length - 1] !== '/') { host += '/'; }
        return host;
      }
      return helpers.fmt("https://%@.zendesk.com/", this.currentAccount().subdomain());
    },

    previewLink: function(event){
      event.preventDefault();
      var $link = this.$(event.target).closest('a');
      $link.parent().parent().parent().removeClass('open');
      var $modal = this.$("#detailsModal");
      $modal.html(this.renderTemplate('modal', {
        title: $link.attr('title'),
        link: $link.attr('href')
      }));
      $modal.modal();
      this.getContentFor($link.attr('data-id'));
      return false;
    },

    copyLink: function(event) {
      event.preventDefault();
      var content = "";

      if (this.useMarkdown) {
        var title = event.target.title;
        var link = event.target.href;
        content = helpers.fmt("[%@](%@)", title, link);
      }
      else {
        if (this.setting('include_title')) {
          content = event.target.title + ' - ';
        }
        content += event.currentTarget.href;
      }
      return this.appendToComment(content);
    },

    getContentFor: function(id) {
      this.ajax(this.setting('search_hc') ? 'getHCArticleContent' : 'getTopicContent', id);
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

    removeStopWords: function(str, stop_words){
      // Remove punctuation and trim
      str = this.removePunctuation(str);
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

      return str;
    },

    removePunctuation: function(str){
      return str.replace(/[\.,-\/#!$%\^&\*;:{}=\-_`~()]/g," ")
        .replace(/\s{2,}/g," ");
    },

    subjectSearchQuery: function(s){
      return this.removeStopWords(this.ticket().subject(), this.stop_words());
    },

    toggleAppContainer: function(){
      var $container = this.$('.app-container'),
      $icon = this.$('.toggle-app i');

      if ($container.is(':visible')){
        $container.hide();
        $icon.prop('class', 'icon-plus');
      } else {
        $container.show();
        $icon.prop('class', 'icon-minus');
      }
    }
  };
}());
