# execute within a TMUX session
if [ -z $TMUX ]; then
	echo "execute within a tmux session (e.g. tmux new -s storyfinder)"
	exit 1
fi

d_mysql="mysql:5.5.51"
n_mysql="sf-mysql"

d_corenlp="kisad/corenlp-german" # my-storyfinder-corenlp
n_corenlp="sf-corenlp"

d_ner="kisad/storyfinder-germaner-git" # kisad/storyfinder-germaner   my-storyfinder-germaner
n_ner="sf-germaner"

d_server="kisad/storyfinder-webserver" # my-storyfinder-server
n_server="sf-server"

port="3055"

tmux rename-window sf-dockers

tmux split-window -d "docker run --name ${n_mysql} -e MYSQL_RANDOM_ROOT_PASSWORD=yes -e MYSQL_DATABASE=storyfinder -e MYSQL_USER=storyfinder -e MYSQL_PORT=3306 -e MYSQL_PASSWORD=storyfinder -d ${d_mysql} && docker logs -f ${n_mysql} || bash"

tmux split-window -d "docker run --rm -m 4g -d --name ${n_corenlp} ${d_corenlp} && docker logs -f ${n_corenlp} || bash"

tmux split-window -d "docker run --rm -dti -m 4g --name ${n_ner} ${d_ner} && docker logs -f ${n_ner} || bash"

sleep 60

tmux split-window -d "docker run --rm -ti --link ${n_mysql}:mysql --link ${n_ner}:germaner --link ${n_corenlp}:corenlp -p ${port}:3055 -e COOKIE_SECRET=YOUR_COOKIE_SECRET -e MYSQL_PORT=3306 --name ${n_server} ${d_server} && docker logs -f ${n_server} || bash"

# dev run:
docker run -ti -p 3055:3055 -v $PWD:/usr/src/app -w /usr/src/app --link ${n_corenlp}:corenlp --link ${n_mysql}:mysql --name ${n_server_dev} ${d_server_dev} bash

tmux select-layout tiled
