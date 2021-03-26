var MOBILE_BINS_MAX = 6
var DESKTOP_BINS_MIN = 9
var DEFAULT_STATION = "KORD"
var DATA_URL = "https://www.istheweatherweird.com/istheweatherweird-data-hourly"

// helper for parsing URL
var getUrlVars = function() {
    var vars = [], hash;
    var hashes = window.location.href.slice(window.location.href.indexOf('?') + 1).split('&');
    for(var i = 0; i < hashes.length; i++)
    {
        hash = hashes[i].split('=');
        vars.push(hash[0]);
        vars[hash[0]] = hash[1];
    }
    return vars;
}

function roundMinutes(date) {
    date = new Date(date.getTime())
    date.setHours(date.getHours() + Math.round(date.getMinutes()/60));
    date.setMinutes(0);

    return date;
}

var getNearestStation = function(geoip, placeMap) {
    placeMap.forEach(function(value, key) {
        // return the place closest to the geoipResponse
        value.distance = distance(
            +geoip.latitude,
            +geoip.longitude,
            +value.LAT,
            +value.LON)
    });

    return Array.from(placeMap.entries())
        .sort(function(a, b) {
            return d3.ascending(a[1].distance, b[1].distance); })[0][1];
}

var lookUpObservations = function(place, interval) {
  // get the most recent observation
  d3.json("/current?place_id=" + place.place_id + "&interval=" + interval).then(function(response) {
      obsTemp = response['temp'] * 1.8 + 32
      obsTime = new Date(response['timestamp'])
      makePage(obsTime, obsTemp, place, interval)
  })
}

// look up static CSV with obs and use it + observed temp to make histogram
var makePage = function(obsTime, obsTemp, place, interval) {
  d3.json("/history?timestamp=" + obsTime.toISOString() + "&place_id=" + place.place_id + "&interval=" + interval).then(function(past) {

    // do any filtering first so everything uses the same data
    if (interval != 'hour') {
      past = past.filter(function(d) { return d.max_gap_hours < 4 })
    }

    // make histograms
    makeHistObject = makeHist("histWrapper", obsTemp, past, obsTime, place, interval)
    var sentence = makeHistObject.sentence
    d3.select("#weird").html(sentence)
    d3.select("#notes").text('Notes:').append('ul').append('li').text(`Weather station: ${place['STATION NAME']}`).append('li').text(`METAR last observation: ${obsTime.toLocaleDateString("en-US",{hour: "numeric", minute:"numeric", timeZone: place.TZ})}`).append('li').text(`NOAA ISD history: ${past.length} observations since ${past[0]['year']}`).append('li').text(`Timezone: ${place.TZ}`)
    makeYearTimeSeries("yearTimeSeriesWrapper", obsTemp, past, obsTime, makeHistObject.x)

    if (phone) {
      $("#weird").css("font-size","30px")
      $('#itww-place-button').css("font-size", "30px")
      $('#itww-interval-button').css("font-size", "30px")
    }

  });
}

intervals = ["hour","day","week","month","year"]
intervalPhrases = {
    hour: "right now",
    day: "in the past day",
    week: "in the past week",
    month: "in the past month",
    year: "in the past year"
} //

var makeHist = function(wrapperId, obs, past, obsTime, place, interval) {
    var margin = {top: 60, right: 50, bottom: 50, left: 50, between: 10}
    past.map(function(x) { x.temp = x.temp * 1.8 + 32 })
    var pastTemps = past.map(function(d) { return d.temp })
    // A formatter for counts.
    var formatCount = d3.format(",.0f");

    var width = parseInt(d3.select("#" + wrapperId).style("width")) - margin.left - margin.right
    var histWidth = 70
    var timeSeriesWidth = width - (histWidth + margin.between)

    var allTemps = pastTemps.concat(obs)
    var tempExtent = d3.extent(allTemps)

    var startingYear = Math.min(...past.map(function(d) { return parseInt(d.year) }))
    var currentYear = obsTime.getFullYear()

    // TODO: replace slice(1,-1) with something smarter...
    var data = past.slice(1,-1).concat({temp: obs, year: parseInt(currentYear), max_gap_hours: 0})
    var x = d3.scaleLinear()
        .domain([startingYear, currentYear])
        .range([0, timeSeriesWidth]);

    y_with_value = d3.scaleLinear()
        .domain([Math.floor(tempExtent[0]),Math.ceil(tempExtent[1])])
        .range([height-margin.bottom, 0]);

    var tickNum = d3.thresholdFreedmanDiaconis(allTemps, tempExtent[0], tempExtent[1])
    if (phone) {
        tickNum = Math.min(tickNum, MOBILE_BINS_MAX)
    } else {
        tickNum = Math.max(tickNum, DESKTOP_BINS_MIN)
    }

    var ticks = y_with_value.ticks(tickNum)
    var bins = d3.bin()
        .value(function(d) {return d.temp})
        .thresholds(ticks)
        (data);

    console.log(data)

    bins = bins.map(function(ar) {
        var tempAr = ar.filter(function(yr) { return yr.year != obsTime.getUTCFullYear() })
        tempAr.x0 = ar.x0
        tempAr.x1 = ar.x1
        return tempAr
    })

    bins[0].x0 = bins[0].x1-(bins[1].x1 - bins[0].x1)
    bins[bins.length-1].x1 = bins[bins.length-1].x0+(bins[1].x1 - bins[0].x1)
    // the maximum number of observations in a bin
    maxFreq = d3.max(bins, function(d) { return d.length; })
    if (phone) {
      var height = 350 - margin.top - margin.bottom
    } else {
      // on dekstop height is maxFreq * 24 to make room for years text
      var height = 400 // maxFreq * 24
    }


    var y = d3.scaleLinear()
        .domain([bins[0].x0,bins[bins.length-1].x1])
        // .domain(d3.extent(x_with_value.ticks(tickNum)))
        .range([height-margin.bottom, 0]);

    var color = d3.scaleSequential(y.domain(), d3.interpolateTurbo)

    xAxis = g => g
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x).tickFormat(d3.format("d")))
        .call(g => g.select(".tick:last-of-type text").clone()
            .attr("text-anchor", "start")
            .attr("font-weight", "bold"))





    // index of last tick for adding dF to label
    var last_label_i = data.length
    var phone_cull = phone && (data.length > MOBILE_BINS_MAX)
    // when number of bins is even and we've culled, last tick is unlabeled
    if (phone_cull && data.length % 2 == 1) {
        last_label_i -= 1
    }
    var yAxis = d3.axisLeft()
        .scale(y)
        .ticks(bins.length+1)
        .tickFormat(function(d, i) {
            var label = ""
            label += d
            if (phone_cull && i % 2 != 0) {
                label = ""
            }

            if (i == last_label_i) {
                label += "ºF"
            }
            return label
        });

    var svg = d3.select("#" + wrapperId).append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
      .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    svg.append("g")
        .attr("class", "y axis")
        .call(yAxis);

    // svg.append("line")
    //     .attr("x1", x(obs))
    //     .attr("y1", -20)
    //     .attr("x2", x(obs))
    //     .attr("y2", height)
    //     .attr("stroke-width", 2)
    //     .attr("opacity", 0.5)
    //     .attr("stroke", "black");

    // index of last tick for adding dF to label
    svg.append("g")
         .attr("stroke-width", 1.5)
         .selectAll("circle")
         .data(data)
         .join("circle")
         .attr("cy", i => y(i.temp))
            .attr("cx", i => x(i.year))
            .attr("r", i => i.year == currentYear ? 7 : 5)
            .attr("fill", d => color(d.temp))
            .attr("stroke", d => color(d.temp));

    var xHist = d3.scaleLinear()
        .domain([0,maxFreq])
        // .domain(d3.extent(x_with_value.ticks(tickNum)))
        .range([0, histWidth]);

    svg.selectAll("rect")
      .data(bins)
    .enter().append("rect")
      .attr("class", "bar")
      .attr("x", 1)
      .attr("transform", function(d) { return "translate(" + (timeSeriesWidth + margin.between) + "," + y(d.x1) + ")"; })
      .attr("height", function(d) { return y(d.x0) - y(d.x1) ; })
      .attr("width", function(d) { return xHist(d.length); })
      .style("stroke", function(d) { return color((d.x0+d.x1)/2) })
      .style("fill", function(d) { return color((d.x0+d.x1)/2) });

      // if (!phone) {
      //   data.forEach(function(d,i) {
      //       d = d.sort(function(e,f) { return f.year - e.year})
      //       d.forEach(function(j,k) {
      //           svg.append("text")
      //           .attr("dy", ".75em")
      //           .attr("y", 5 + y(d.length) + k * 24)
      //           .attr("x", x(d.x0) + (x(d.x1) - x(d.x0)) / 2)
      //           .attr("text-anchor", "middle")
      //           //.attr("fill", "white")
      //           //.attr("stroke", "white")
      //           .text(j.year);
      //       })
      //   })
      //
      // }

    svg.append("g")
        .attr("class", "x axis")
        .attr("transform", "translate(0," + height + ")")
        .call(xAxis);


    svg.append("text")
        // .attr("dy", ".75em")
        .attr("y", -20)
        .attr("x", x(obs))
        .attr("text-anchor", "middle")
        .attr("font-size", "24px")
        .text(obsTime.getFullYear());

    var histTimeText = obsTime.toLocaleDateString("en-US",{month: "short", day: "numeric", hour: "numeric", timeZone: place.TZ})
    var obsInterval = interval == "hour" ? `${histTimeText} Temperatures` : `Temperatures for the ${interval} ending ${histTimeText}`
    svg.append("text")      // text label for the x axis
            .attr("transform", "translate(" + (width / 2) + " ," + (height + margin.bottom - 5) + ")")
            .style("text-anchor", "middle")
            .text(obsInterval);

  // build the sentence
  var totalYears = pastTemps.length
  var perc = (pastTemps.filter(d => d < obs).length / totalYears) * 100

  var warm = perc >= 50
  var percRel = warm ? perc : 100 - perc
  percRel = Math.round(percRel, 0)

  var weirdness = 0
  var record = false
  if (percRel >= 97.5) {
      weirdness = 3
      if (percRel == 100) {
          record = true
      }
  } else if (percRel >= 90) {
      weirdness = 2
  } else if (percRel >= 80) {
      weirdness = 1
  }

  var firstYear = past[0].year

  var placeDropdownHtml = "<div class='dropdown div-inline'><button id='itww-place-button' class='btn btn-secondary btn-lg btn-place dropdown-toggle' type='button' id='placeDropdownMenuButton' data-toggle='dropdown' aria-haspopup='true' aria-expanded='false'>" + place.place + "</button><div class='dropdown-menu' aria-labelledby='placeDropdownMenuButton'>"
  Array.from(placeMap.values()).forEach(function(p) {
    placeDropdownHtml += "<a class='dropdown-item"
    if (p.ICAO == place.ICAO) {
      placeDropdownHtml += " active"
    }
    placeDropdownHtml += "' href='?station=" + p.ICAO + "&interval=" + interval + "'>" + p.place + "</a>"
  });
  placeDropdownHtml += "</div></div>"

  var intervalDropdownHtml = "<div class='dropdown div-inline'><button id='itww-interval-button' class='btn btn-secondary btn-lg btn-place dropdown-toggle' type='button' id='intervalDropdownMenuButton' data-toggle='dropdown' aria-haspopup='true' aria-expanded='false'>" + intervalPhrases[interval] + "</button><div class='dropdown-menu' aria-labelledby='intervalDropdownMenuButton'>"
  intervals.forEach(function(i) {
    intervalDropdownHtml += "<a class='dropdown-item"
    if (i == interval) {
      intervalDropdownHtml += " active"
    }
    intervalDropdownHtml += "' href='?station=" + place.ICAO + "&interval=" + i + "'>" + intervalPhrases[i] + "</a>"
  });
  intervalDropdownHtml += "</div></div>"

  var obsRound = Math.round(obs, 0)

  var weirdnessTexts = [
    'typical',
    'a bit weird',
    'weird',
    'very weird'
  ]
  var weirdnessText = weirdnessTexts[weirdness]

  var compTexts = [
    ['colder', 'coldest'],
    ['warmer', 'warmest']
  ]
  // use unary + to convert boolean to integer for indexing
  var compText = compTexts[+warm][+record]

  var style = weirdness == 0 ? 'typical' : compText
  var weirdnessHtml = `<span class='itww-${style}'>${weirdnessText}</span>`
  // only style the comparative if its not typical
  var compHtml = weirdness == 0 ? compText : `<span class='itww-${style}'>${compText}</span>`
  var verbTense = interval == "hour" ? "is" : "was"
  var obsVerb = interval == "hour" ? "It's" : "It was"
  var obsAvg = interval == "hour" ? "" : " on average"
  obsInterval = obsInterval.replace("Temperatures", "temperatures")

  var sentence1 = `The weather in ${placeDropdownHtml} ${verbTense} ${weirdnessHtml} ${intervalDropdownHtml}.`
  var sentence2 = ''
  if (!record) {
    sentence2 += `${obsVerb} ${obsRound}ºF${obsAvg}, ${compHtml} than ${percRel}% of ${obsInterval} on record.`
  } else {
    obsInterval = obsInterval.replace("temperatures", "temperature")
    sentence2 += `${obsVerb} ${obsRound}ºF${obsAvg}, the ${compHtml} ${obsInterval} on record.`
  }

  //     return svg.node();
  return {sentence: sentence1 + ' <br/><span style="font-size:25px">' + sentence2 + '</span>', x: x}
}

var makeYearTimeSeries = function(wrapperId, obs, past, obsTime, y) {

        // .call(g => g.select(".domain").remove())





}

var phone = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)


d3.json("/stations").then(function(data) {
    data.sort(function(a, b){
        if(a.place < b.place) { return -1; }
        if(a.place > b.place) { return 1; }
        return 0;
    })
    placeMap = new Map(data.map(d => [d.ICAO, d]));
    var interval;
    if ('interval' in getUrlVars()) {
        interval = getUrlVars().interval
    } else {
        interval = "hour"
    }
    /* If we get an error we will */
    var onError = function (error) {
      lookUpObservations(placeMap.get(DEFAULT_STATION),interval)
    };

    station = getUrlVars().station
    if (station) {
        place = placeMap.get(station)
        if (place) {
            lookUpObservations(place, interval)
        } else {
            onError()
        }
    } else {
        $.getJSON("https://get.geojs.io/v1/ip/geo.json", function(geoip) {
            place = getNearestStation(geoip, placeMap)
            lookUpObservations(place,interval)
        }).fail(function() {
            onError()
        })
    }
});
