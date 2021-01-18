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

var lookUpObservations = function(place,interval) {
  // get the most recent observation
  d3.json("https://api.weather.gov/stations/"+ place.ICAO + "/observations/latest").then(function(response) {
    // if it doesn't have an observation, look further back
    if (response.properties.temperature.value == null) {
        d3.json("https://api.weather.gov/stations/"+ place.ICAO + "/observations").then(function(newResponse) {
          var obsTime = 0
          var obsTemp = null
          for (var i = 0; i < newResponse.features.length; i++) {
            obsTemp = newResponse.features[i].properties.temperature.value
            if (obsTemp != null) {
              obsTemp = obsTemp  * 1.8 + 32;
              obsTime = new Date(newResponse.features[i].properties.timestamp)
              break
            }
          }
          makePage(obsTime,obsTemp,place,interval)
        })
    // otherwise, go for it!
    } else {
      var obsTime = new Date(response.properties.timestamp)
      var obsTemp = response.properties.temperature.value * 1.8 + 32;
      makePage(obsTime,obsTemp,place,interval)
    }
  })
}

// look up static CSV with obs and use it + observed temp to make histogram
var makePage = function(obsTime,obsTemp,place,interval) {
  // put hist time at nearest hour
  var histTime = roundMinutes(obsTime)
  id = place.USAF + "-" + place.WBAN
  var pastUrl = DATA_URL + "/csv/" + id + "/" + String(histTime.getUTCMonth()+1).padStart(2,'0') + String(histTime.getUTCDate()).padStart(2,'0') + ".csv"
  var histUTCHour = histTime.getUTCHours()
  d3.csv(pastUrl,function(d) {
    if (+d.hour == histUTCHour) {
      return {year: +d.year, temp: 32 + (+d.temp) * 0.18}
    };
  }).then(function(past) {
    // make histograms
    var sentence = makeHist("histWrapper", obsTemp, past, obsTime, place, histTime, interval)
    d3.select("#weird").html(sentence)
    Place = place
    Past = past
    ObsTime = obsTime
    d3.select("#notes").text('Notes:').append('ul').append('li').text(`Weather station: ${place['STATION NAME']}`).append('li').text(`NWS API last observation: ${obsTime.toLocaleDateString("en-US",{hour: "numeric", minute:"numeric", timeZone: place.TZ})}`).append('li').text(`NOAA ISD history: ${Past.length} observations since ${Past[0]['year']}`).append('li').text(`Timezone: ${place.TZ}`)
    makeYearTimeSeries("yearTimeSeriesWrapper", obsTemp, past, obsTime, place, histTime)

    if (phone) {
      $("#weird").css("font-size","30px")
      $('#itww-place-button').css("font-size", "30px")
    }

  });
}

intervals = ["hour","day","month","year","decade"]

var makeHist = function(wrapperId, obs, past, obsTime, place, histTime, interval) {
  var pastTemps = past.map(function(d) { return d.temp })
  // A formatter for counts.
  var formatCount = d3.format(",.0f");

  var margin = {top: 60, right: 30, bottom: 50, left: 30}

  var width = parseInt(d3.select("#" + wrapperId).style("width")) - margin.left - margin.right

  var allTemps = pastTemps.concat(obs)
  var tempExtent = d3.extent(allTemps)

  x_with_value = d3.scaleLinear()
    .domain([Math.floor(tempExtent[0]),
             Math.ceil(tempExtent[1])])
    .range([0, width]);

    var tickNum = d3.thresholdFreedmanDiaconis(allTemps, tempExtent[0], tempExtent[1])
    if (phone) {
      tickNum = Math.min(tickNum, MOBILE_BINS_MAX)
    } else {
      tickNum = Math.max(tickNum, DESKTOP_BINS_MIN)
    }

    var ticks = x_with_value.ticks(tickNum)
    var data = d3.bin()
        .value(function(d) {return d.temp})
        .thresholds(ticks)
        (past.concat({temp: obs, year: obsTime.getUTCFullYear()}));

    data = data.map(function(ar) {
      var tempAr = ar.filter(function(yr) { return yr.year != obsTime.getUTCFullYear() })
      tempAr.x0 = ar.x0
      tempAr.x1 = ar.x1
      return tempAr
    })

    data[0].x0 = data[0].x1-(data[1].x1 - data[0].x1)
    data[data.length-1].x1 = data[data.length-1].x0+(data[1].x1 - data[0].x1)
    var x = d3.scaleLinear()
        .domain([data[0].x0,data[data.length-1].x1])
        // .domain(d3.extent(x_with_value.ticks(tickNum)))
        .range([0,width]);

    // the maximum number of observations in a bin
    maxFreq = d3.max(data, function(d) { return d.length; })
    if (phone) {
      var height = 350 - margin.top - margin.bottom
    } else {
      // on dekstop height is maxFreq * 24 to make room for years text
      var height = maxFreq * 24
    }

    var y = d3.scaleLinear()
        .domain([0, maxFreq])
        .range([height, 0]);

    // index of last tick for adding dF to label
    var last_label_i = data.length
    var phone_cull = phone && (data.length > MOBILE_BINS_MAX)
    // when number of bins is even and we've culled, last tick is unlabeled
    if (phone_cull && data.length % 2 == 1) {
        last_label_i -= 1
    }
    var xAxis = d3.axisBottom()
        .scale(x)
        .ticks(data.length+1)
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

    svg.append("line")
        .attr("x1", x(obs))
        .attr("y1", -20)
        .attr("x2", x(obs))
        .attr("y2", height)
        .attr("stroke-width", 2)
        .attr("opacity", 0.5)
        .attr("stroke", "black");

    svg.selectAll("rect")
      .data(data)
    .enter().append("rect")
      .attr("class", "bar")
      .attr("x", 1)
      .attr("transform", function(d) { return "translate(" + x(d.x0) + "," + y(d.length) + ")"; })
      .attr("width", function(d) { return x(d.x1) - x(d.x0) ; })
      .attr("height", function(d) { return height - y(d.length); });

      if (!phone) {
        data.forEach(function(d,i) {
            d = d.sort(function(e,f) { return f.year - e.year})
            d.forEach(function(j,k) {
                svg.append("text")
                .attr("dy", ".75em")
                .attr("y", 5 + y(d.length) + k * 24)
                .attr("x", x(d.x0) + (x(d.x1) - x(d.x0)) / 2)
                .attr("text-anchor", "middle")
                //.attr("fill", "white")
                //.attr("stroke", "white")
                .text(j.year);
            })
        })

      }

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

    var histTimeText = histTime.toLocaleDateString("en-US",{month: "short", day: "numeric", hour: "numeric", timeZone: place.TZ})
    svg.append("text")      // text label for the x axis
            .attr("transform", "translate(" + (width / 2) + " ," + (height + margin.bottom - 5) + ")")
            .style("text-anchor", "middle")
            .text(histTimeText + " Temperatures");

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

  var intervalDropdownHtml = "<div class='dropdown div-inline'><button id='itww-time-button' class='btn btn-secondary btn-lg btn-place dropdown-toggle' type='button' id='intervalDropdownMenuButton' data-toggle='dropdown' aria-haspopup='true' aria-expanded='false'>" + interval + "</button><div class='dropdown-menu' aria-labelledby='intervalDropdownMenuButton'>"
  intervals.forEach(function(i) {
    intervalDropdownHtml += "<a class='dropdown-item"
    if (i == interval) {
      intervalDropdownHtml += " active"
    }
    intervalDropdownHtml += "' href='?station=" + place.ICAO + "&interval=" + i + "'>" + i + "</a>"
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

  // var averageHtml;
  // if (interval == "hour") {
  //   averageHtml = "";
  // } else {
  //   averageHtml = "average ";
  // }
  var averageHtml = ""

  var sentence1 = `The ${averageHtml}weather in the past ${intervalDropdownHtml} in ${placeDropdownHtml} is ${weirdnessHtml}.`
  var sentence2 = ''
  if (!record) {
    sentence2 += `It's ${obsRound}ºF, ${compHtml} than ${percRel}% of ${histTimeText} temperatures on record.`
  } else {
    sentence2 += `It's ${obsRound}ºF, the ${compHtml} ${histTimeText} temperature on record.`
  }
  return sentence1 + ' <br/><span style="font-size:25px">' + sentence2 + '</span>'
}


var makeYearTimeSeries = function(wrapperId, obs, past, obsTime, place, histTime) {
  var pastTemps = past.map(function(d) { return d.temp })
  var startingYear = Math.min(...past.map(function(d) { return parseInt(d.year) }))
  var currentYear = obsTime.getFullYear()

  // A formatter for counts.
  var formatCount = d3.format(",.0f");

  var margin = {top: 60, right: 30, bottom: 50, left: 30}

  var width = parseInt(d3.select("#" + wrapperId).style("width")) - margin.left - margin.right

  var allTemps = pastTemps.concat(obs)
  var tempExtent = d3.extent(allTemps)

  x_with_value = d3.scaleLinear()
    .domain([Math.floor(tempExtent[0]),
             Math.ceil(tempExtent[1])])
    .range([0, width]);

    var tickNum = d3.thresholdFreedmanDiaconis(allTemps, tempExtent[0], tempExtent[1])
    if (phone) {
      tickNum = Math.min(tickNum, MOBILE_BINS_MAX)
    } else {
      tickNum = Math.max(tickNum, DESKTOP_BINS_MIN)
    }

    var ticks = x_with_value.ticks(tickNum)
    var data = d3.bin()
        .value(function(d) {return d.temp})
        .thresholds(ticks)
        (past.concat({temp: obs, year: obsTime.getUTCFullYear()}));

    data = data.map(function(ar) {
      var tempAr = ar.filter(function(yr) { return yr.year != obsTime.getUTCFullYear() })
      tempAr.x0 = ar.x0
      tempAr.x1 = ar.x1
      return tempAr
    })

    data[0].x0 = data[0].x1-(data[1].x1 - data[0].x1)
    data[data.length-1].x1 = data[data.length-1].x0+(data[1].x1 - data[0].x1)
    var x = d3.scaleLinear()
        .domain([data[0].x0,data[data.length-1].x1])
        // .domain(d3.extent(x_with_value.ticks(tickNum)))
        .range([0,width]);

    // the maximum number of observations in a bin
    maxFreq = d3.max(data, function(d) { return d.length; })
    if (phone) {
      var height = 350 - margin.top - margin.bottom
    } else {
      // on dekstop height is maxFreq * 24 to make room for years text
      var height = maxFreq * 24
    }

    var y = d3.scaleLinear()
        .domain([startingYear, currentYear])
        .range([height, 0]);

    // index of last tick for adding dF to label
    var last_label_i = data.length
    var phone_cull = phone && (data.length > MOBILE_BINS_MAX)
    // when number of bins is even and we've culled, last tick is unlabeled
    if (phone_cull && data.length % 2 == 1) {
        last_label_i -= 1
    }
    var xAxis = d3.axisBottom()
        .scale(x)
        .ticks(data.length+1)
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

    svg.append("line")
        .attr("x1", x(obs))
        .attr("y1", -20)
        .attr("x2", x(obs))
        .attr("y2", height)
        .attr("stroke-width", 2)
        .attr("opacity", 0.5)
        .attr("stroke", "black");

    var yearTimeSeriesLine = d3.line()
        .x(d => x(parseFloat(d.temp)))
        .y(d => y(parseInt(d.year)))


    svg.append("path")
        .datum(data)
        .attr("d",yearTimeSeriesLine)

    // svg.selectAll("rect")
    //   .data(data)
    // .enter().append("rect")
    //   .attr("class", "bar")
    //   .attr("x", 1)
    //   .attr("transform", function(d) { return "translate(" + x(d.x0) + "," + y(d.length) + ")"; })
    //   .attr("width", function(d) { return x(d.x1) - x(d.x0) ; })
    //   .attr("height", function(d) { return height - y(d.length); });

      if (!phone) {
        data.forEach(function(d,i) {
            d = d.sort(function(e,f) { return f.year - e.year})
            d.forEach(function(j,k) {
                svg.append("text")
                .attr("dy", ".75em")
                .attr("y", 5 + y(d.length) + k * 24)
                .attr("x", x(d.x0) + (x(d.x1) - x(d.x0)) / 2)
                .attr("text-anchor", "middle")
                //.attr("fill", "white")
                //.attr("stroke", "white")
                .text(j.year);
            })
        })

      }

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
        .text(currentYear);

    var histTimeText = histTime.toLocaleDateString("en-US",{month: "short", day: "numeric", hour: "numeric", timeZone: place.TZ})
    svg.append("text")      // text label for the x axis
            .attr("transform", "translate(" + (width / 2) + " ," + (height + margin.bottom - 5) + ")")
            .style("text-anchor", "middle")
            .text(histTimeText + " Temperatures");
}

var phone = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)


var stations_url = DATA_URL + "/csv/stations.csv"
d3.csv(stations_url).then(function(data) {
    // placeMap = new Map()
    // placeMap = d3.map(data, function(d) { return d.ICAO })
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
            lookUpObservations(place,interval)
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
