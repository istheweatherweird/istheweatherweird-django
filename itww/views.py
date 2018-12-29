from django.shortcuts import render
from django.http import HttpResponse, Http404

import requests
from metar import Metar

def get_metar(call):
     metar_url = 'http://tgftp.nws.noaa.gov/data/observations/metar/stations/%s.TXT' % call
     return requests.get(metar_url)

def index(request):
    call = 'KORD'
    response = get_metar(call)

    if response.status_code != 200:
        raise Http404('Failed to retrieve current weather (%s)' % response.status_code)
    
    metar_txt = response.text.split('\n')[1]
    obs = Metar.Metar(metar_txt)

    return render(request, 'itww/index.html', 
                  {'obsTemp': obs.temp.value(),
                   'obsTime': obs.time.timestamp()}) 
