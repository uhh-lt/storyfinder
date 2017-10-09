#!/bin/bash

docker login --username=remstef

docker build -t remstef/storyfinder .

docker push remstef/storyfinder
