// Parse CSV

// get date
var placeDict = {
  Chicago: {number: "725300-94846", word: "KORD"},
  SF: {number: "724940-23234", word: "KSFO"}
}
var place = "Chicago"

var observationUrl = "https://api.weather.gov/stations/"+ placeDict[place].word + "/observations/latest"

var phone = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 

if (phone) {
  $("#weird").css("font-size","30px")
}

d3.json(observationUrl).then(function(response) {
  var obsTime = new Date(response.properties.timestamp)
  console.log(response.properties.timestamp)
  // put observation time at nearest hour
  if (obsTime.getMinutes() > 29) {
    obsTime.setTime(obsTime.getTime() + (60*60*1000))
  }

  var obsTemp = response.properties.temperature.value * 1.8 + 32;

  var pastUrl = "https://istheweatherweird.github.io/istheweatherweird-data-hourly/csv/" + placeDict[place].number + "/" + String(obsTime.getUTCMonth()+1).padStart(2,'0') + String(obsTime.getUTCDate()).padStart(2,'0') + ".csv"
  var obsUTCHour = obsTime.getUTCHours()
  d3.csv(pastUrl,function(d) {
    if (+d.hour == obsUTCHour) {
      return {year: +d.year, temp: 32 + (+d.temp) * 0.18}
    };
  }).then(function(past) {
    // make histograms
    var sentence = makeHist("graphWrapper", obsTemp, past, obsTime)
    d3.selectAll("#weird").text(sentence)
    // d3.selectAll("#sentence").text("The weather in Chicago is not weird.")
  });
})

data = 3

var makeHist = function(wrapperId, obs, past, obsTime) {
  var pastTemps = past.map(function(d) { return d.temp })
  // A formatter for counts.
  var formatCount = d3.format(",.0f");

  var margin = {top: 60, right: 30, bottom: 30, left: 30}

 var width = parseInt(d3.select("#" + wrapperId).style("width")) - margin.left - margin.right,
    height = 500 - margin.top - margin.bottom;
    if (phone) {
      height -= 100
    }
  
  var x_with_value = d3.scaleLinear()
    .domain([Math.floor(d3.extent(pastTemps.concat(obs))[0]), Math.ceil(d3.extent(pastTemps.concat(obs))[1])])
    .range([0, width]);
    


    // Generate a histogram using twenty uniformly-spaced bins.
    if (phone) {
      var tickNum = 8
    } else {
      var tickNum = 15      
    }
    var data = d3.histogram()
        .value(function(d) {return d.temp})
        .thresholds(x_with_value.ticks(tickNum))
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

    var y = d3.scaleLinear()
        .domain([0, d3.max(data, function(d) { return d.length; })])
        .range([height, 0]);

    var xAxis = d3.axisBottom()
        .scale(x)
        .ticks(data.length+1)
        .tickFormat(function(d) {return d+"F"});

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
      .attr("width", function(d) { return x(d.x1) - x(d.x0) -1 ; })
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
                // .attr("fill", "white")
                // .attr("stroke", "white")
                .text(j.year);
            })
        })
        
      }

    // .append("text")
    //     .attr("dy", ".75em")
    //     .attr("y", 6)
    //     .attr("x", x(data[0].dx + x.domain()[0]) / 2)
    //     .attr("text-anchor", "middle")
    //     .text(function(d) { return formatCount(d.y); });

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
        
  var totalYears = pastTemps.length
  var sentence = "It's " + Math.round(obs,0) + "ºF, "
  var perc = (pastTemps.filter(d => d < obs).length / totalYears) * 100
  var typical = false
  var record = false
  if ((perc >= 25) && (perc <= 75)) {
    sentence += "typical for "
    typical = true
  } else {
    if (perc > 75) {
      if (perc == 100) {
        sentence += "the hottest "
        record = true
      } else {
        sentence += "warmer than " + Math.floor(perc / 5)*5 + "% of "
      }
    } else {
      if (perc == 0) {
        sentence += "the coldest "
        record = true
      } else {
        sentence += "colder than " + Math.floor((100-perc) / 5)*5 + "% of "
      }
    }
  }
  sentence += obsTime.toLocaleDateString("en-US",{month: "short", day: "numeric", hour: "numeric"})
  if (!typical && !record) {
    sentence += " temperatures"
  }
  sentence += " in " + place
  if (record) {
    sentence += " on record"
  }
  sentence +=  " since " + past[0].year + "."
  return sentence
}

var isweird = function(vs,value) {
  var totalYears = vs.length
  above = vs.filter(d => d > value).length / totalYears
  below = vs.filter(d => d < value).length / totalYears
  if (above < .1) {
    return "warm"
  } else {
    if (below < .1) {
      return "cold"
    } else {
      return false
    }
  }
}


// function drawLine(data) {
//   var svgWidth =
// }
