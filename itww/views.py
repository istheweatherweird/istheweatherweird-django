from django.shortcuts import render
from django.http import HttpResponse, Http404
import json

import requests
from metar import Metar

def metar(request):
    call = request.GET['call']
    metar_url = 'http://tgftp.nws.noaa.gov/data/observations/metar/stations/%s.TXT' % call

    response = requests.get(metar_url) 

    if response.status_code != 200:
        raise Http404('Failed to retrieve current weather (%s)' % response.status_code)
    
    metar_txt = response.text.split('\n')[1]
    obs = Metar.Metar(metar_txt)
    obsDict = {'obsTemp': obs.temp.value(),
               'obsTime': obs.time.timestamp()}

    data = json.dumps(obsDict)
    return HttpResponse(data, content_type='application/json')

def index(request):
    return render(request, 'itww/index.html')
