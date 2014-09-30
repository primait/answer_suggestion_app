(function() {
  return {
    defaultState: 'spinner',
    defaultNumberOfEntriesToDisplay: 10,

    events: {
      // APP EVENTS
      'app.activated': 'activated',
      'ticket.subject.changed': _.debounce(function(){ this.initialize(); }, 500),

      // AJAX EVENTS
      'searchHelpCenter.done': 'searchHelpCenterDone',
      'searchWebPortal.done': 'searchWebPortalDone',
      'getHcArticle.done': 'getHcArticleDone',
      'getSectionAccessPolicy.done': 'getSectionAccessPolicyDone',
      'settings.done': 'settingsDone',

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

      getHcArticle: function(id) {
        return {
          url: helpers.fmt('/api/v2/help_center/articles/%@.json?include=translations', id),
          type: 'GET'
        };
      },

      getSectionAccessPolicy: function(sectionId) {
        return {
          url: helpers.fmt('/api/v2/help_center/sections/%@/access_policy.json', sectionId),
          type: 'GET'
        };
      },

      searchHelpCenter: function(query){
        return {
          url: helpers.fmt('/api/v2/help_center/articles/search.json?per_page=%@&query=%@', this.queryLimit(), query),
          type: 'GET'
        };
      },

      searchWebPortal: function(query){
        return {
          url: helpers.fmt('/api/v2/search.json?per_page=%@&query=%@ type:topic', this.queryLimit(), query),
          type: 'GET'
        };
      },

      fetchTopicsWithForums: function(ids){
        return {
          url: helpers.fmt('/api/v2/topics/show_many.json?ids=%@&include=forums', ids.join(',')),
          type: 'POST'
        };
      }
    },

    search: function(query) {
      this.switchTo('spinner');

      if (this.setting('search_hc')) {
        this.ajax('searchHelpCenter', query);
      } else {
        this.ajax('searchWebPortal', query);
      }
    },

    activated: function(app){
      if (app.firstLoad)
        return this.initialize();
    },

    initialize: function(){
      if (_.isEmpty(this.ticket().subject()))
        return this.switchTo('no_subject');
      this.ajax('settings').then(function() {
        this.search(this.subjectSearchQuery());
      }.bind(this));
    },

    settingsDone: function(data) {
      this.useMarkdown = data.settings.tickets.markdown_ticket_comments;
    },

    hcArticleLocaleContent: function(data) {
      var currentLocale = this.currentUser().locale(),
          translations = data.article.translations;

      var localizedTranslation = _.find(translations, function(translation) {
        return translation.locale.toLowerCase() === currentLocale.toLowerCase();
      });

      return localizedTranslation && localizedTranslation.body || translations[0].body;
    },

    renderAgentOnlyAlert: function() {
      var alert = this.renderTemplate('alert');
      this.$('#detailsModal .modal-body').prepend(alert);
    },

    isAgentOnlyContent: function(data) {
      return data.agent_only || data.access_policy && data.access_policy.viewable_by !== 'everybody';
    },

    getHcArticleDone: function(data) {
      this.ajax('getSectionAccessPolicy', data.article.section_id);

      var html = this.hcArticleLocaleContent(data);
      this.$('#detailsModal .modal-body .content-body').html(html);
    },

    getSectionAccessPolicyDone: function(data) {
      if (this.isAgentOnlyContent(data)) { this.renderAgentOnlyAlert(); }
    },

    searchHelpCenterDone: function(data){
      this.renderList(this.formatHcEntries(data.results));
    },

    searchWebPortalDone: function(data){
      if (_.isEmpty(data.results))
        return this.switchTo('no_entries');

      var topics = data.results,
          topicIds = _.map(topics, function(topic) { return topic.id; });

      this.ajax('fetchTopicsWithForums', topicIds)
        .done(function(data){
          var entries = this.formatEntries(topics, data);
          this.store('entries', entries);
          this.renderList(entries);
        });
    },

    renderList: function(data){
      if (_.isEmpty(data.entries)) {
        return this.switchTo('no_entries');
      } else {
        this.switchTo('list', data);
      }
    },

    formatEntries: function(topics, result){
      var entries = _.inject(topics, function(memo, topic){
        var forum = _.find(result.forums, function(f){ return f.id == topic.forum_id; });
        var entry = {
          id: topic.id,
          url: helpers.fmt("%@entries/%@", this.baseUrl(), topic.id),
          title: topic.title,
          body: topic.body,
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
        var url = entry.html_url.replace(/^https:\/\/.*.zendesk(-staging|-gamma)?.com\//, this.baseUrl());

        memo.push({
          id: entry.id,
          url: url,
          title: title
        });
        return memo;
      }, [], this);

      return { entries: entries };
    },

    processSearchFromInput: function(){
      var query = this.removePunctuation(this.$('.custom-search input').val());
      if (query && query.length) { this.search(query); }
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

    renderTopicContent: function(id) {
      var topic = _.find(this.store('entries').entries, function(entry) {
        return entry.id == id;
      });
      this.$('#detailsModal .modal-body .content-body').html(topic.body);
      if (this.isAgentOnlyContent(topic)) { this.renderAgentOnlyAlert(); }
    },

    getContentFor: function(id) {
      if (this.setting('search_hc')) {
        this.ajax('getHcArticle', id);
      } else {
        this.renderTopicContent(id);
      }
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

    queryLimit: function(){
      // ugly hack to return more results than needed because we filter out agent only content
      if (this.setting('exclude_agent_only') && !this.setting('search_hc')) {
        return this.numberOfDisplayableEntries() * 2;
      } else {
        return this.numberOfDisplayableEntries();
      }
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
