'use strict';

const express = require('express');
const pg = require('pg');
const superagent = require('superagent');
require('dotenv').config();
require('ejs');
const methodOverride = require('method-override');

const app = express();
const PORT = process.env.PORT || 3001;
const client = new pg.Client(process.env.DATABASE_URL);
client.on('client error', error => {
  console.log('client error: ', error);
});

app.set('view engine', 'ejs');

// middleware

app.use(express.static('./public')); //if not finding pages move views into public folder
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));

// paths

app.post('/pages', renderResults);
// app.post('/pages', renderResults);
app.get('/', renderHome);
app.get('/index/:id', renderIndex);
app.post('/addplant', addToGreenhouse);
app.get('/greenhouse/:id', renderGreenhouse);
// app.post('/greenhouse', renderGreenhouse);
app.delete('/greenhouse/:id', deletePlant);
app.delete('/notes/:id', deleteNote);
app.get('/details/:id', renderDetails);
// app.get('/details/:id/:plantid', renderDetails);
app.get('/aboutUs/:id', renderAboutUs);
app.put('/addNote/:id', addNotes);
app.put('/updateNotes/:id', updateNotes);
app.post('/addUser', addUser);

app.use('*', (request, response) => response.status(404).send('Page not Found'));

// --------- Functions -------

function renderHome(request, response)
{
  // response.render('index');
  response.render('login');
}

//---------------------------
function renderIndex(request, response)
{
  let id = request.params.id;
  console.log('userId in index', id);

  response.status(200).render('index', {user: id})
}

//-----------------------------
function renderResults(request, response)
{
  console.log('user_key in result', request.body);
  let user_key = request.body.user_key;
  let searchName = request.body.search;
  searchName = searchName.charAt(0).toUpperCase() + searchName.toLowerCase().slice(1);

  const url = 'http://harvesthelper.herokuapp.com/api/v1/plants'

  let queryParams = {
    api_key: process.env.PLANTS_API_KEY
  }

  superagent.get(url)
    .query(queryParams)

    .then(results => {
      results.body.forEach(item => {
        if (item.name === searchName) {
          let imageHash = 'https://res-5.cloudinary.com/do6bw42am/image/upload/c_scale,f_auto,h_300/v1/';

          let alreadyExists = false;
          let sql = 'SELECT name FROM greenhouse WHERE name=$1 AND user_key=$2;';
          let safeValue = [searchName, user_key];

          client.query(sql, safeValue)
            .then (results => {
              if(results.rowCount > 0){
                alreadyExists = true;
                response.render('pages/results.ejs', { target: item, targetImg: imageHash, alreadyExists: alreadyExists, user: user_key});
              } else{
                alreadyExists = false;
                response.render('pages/results.ejs', { target: item, targetImg: imageHash, alreadyExists: alreadyExists, user : user_key});
              }
            })
        }
      });
    }).catch((error) => {
      console.log('ERROR', error);
      response.render('pages/error');
    })
}


function addToGreenhouse(request, response){

  console.log('in add to greenhouse', request.body)
  let {name, description, image_url, optimal_sun, optimal_soil, planting_considerations, when_to_plant, growing_from_seed, transplanting, spacing, watering, feeding, other_care, diseases, pests, harvesting, storage_use, user_key} = request.body;

  let sql = 'INSERT INTO greenhouse (name, description, image_url, optimal_sun, optimal_soil, planting_considerations, when_to_plant, growing_from_seed, transplanting, spacing, watering, feeding, other_care, diseases, pests, harvesting, storage_use, user_key) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING id;';

  image_url = `https://res-5.cloudinary.com/do6bw42am/image/upload/c_scale,f_auto,h_300/v1/${image_url}`;

  let safeValues = [name, description, image_url, optimal_sun, optimal_soil, planting_considerations, when_to_plant, growing_from_seed, transplanting, spacing, watering, feeding, other_care, diseases, pests, harvesting, storage_use, user_key];

  client.query(sql, safeValues)
    .then(() => {
      //defining id so that we can use it to uniquely identify users in stretch goals
      // let id = results.rows[0].id;

      let imageHash = 'https://res-5.cloudinary.com/do6bw42am/image/upload/c_scale,f_auto,h_300/v1/';

      let alreadyExists = true;

      response.render('pages/results.ejs', { target: request.body, targetImg: imageHash, alreadyExists: alreadyExists, user: user_key})
    })
}

//------------------------------



function renderGreenhouse(request, response)
{
  let id = request.params.id;
  let sql = `SELECT * FROM greenhouse WHERE user_key=${id} ;`; //WHERE user_id = request.

  client.query(sql)
    .then(plants => {

      let plantArray = plants.rows;

      response.render('pages/greenhouse', {target: plantArray, user: id});
    }).catch((error) => {
      console.log('ERROR', error);
      response.render('pages/error');
    })
}

//------------------------------------------
function deletePlant(request, response)
{
  let id = request.params.id;

  let sql = 'DELETE FROM greenhouse WHERE id=$1;';

  let safeValue = [id];

  client.query(sql, safeValue)
    .then (() => {
      response.status(200).redirect('/greenhouse')
    })
}








//--------------------------------------------
function renderDetails(request, response)
{

  let id = request.params.id;

  let sql = 'SELECT * FROM greenhouse WHERE id=$1;';
  let safeValue = [id];

  let sql2 = 'SELECT * FROM notes WHERE plant_key=$1;';

  client.query(sql, safeValue)
    .then(plant => {
      console.log('plant in details', plant)
      client.query(sql2, safeValue)
        .then(ourNotes =>
        {
          response.status(200).render('pages/details',{detailsTarget: plant.rows[0], notesArray: ourNotes.rows, user: plant.rows[0].user_key});
        })
    }).catch((error) => {
      console.log('ERROR', error);
      response.render('pages/error');
    })
}


//-------------------------------------
function deleteNote(request, response)
{
  let id = request.params.id;

  let sql = 'DELETE FROM notes WHERE id=$1 RETURNING plant_key;';

  let safeValue = [id];

  client.query(sql, safeValue)
    .then (keys => {
      let keyID = keys.rows[0].plant_key;
      response.status(200).redirect(`/details/${keyID}`)
    })

}

//------------------------------------
function addNotes(request, response)
{
  // reconnect new sql file to make and join new tables
  // figure out where to render notes (details page)
  // SELECT * FROM notes ===== render this
  // INSERT first into notes table
  // render notes somewhere === refresh to same page
  // add button to edit or delete with each note
  // responce will be to refresh page and will stack notes

  let id = request.params.id;
  let notes = request.body.notes;
  let sql = 'INSERT INTO notes (user_notes, plant_key) VALUES ($1, $2);';

  let safeValues = [notes, id];

  client.query(sql, safeValues)
    .then(() =>
    {
      response.status(200).redirect(`/details/${id}`);
    })
}
//=====================================================

function addUser(request, response)
{
// check if user exist1111111111111111111111111111111111111111111
  //let emails = 'SELECT email FROM '
  let {name, email, zipcode} = request.body;
  let sql = 'INSERT INTO user_table (name, email, zipcode) VALUES ($1, $2, $3) RETURNING id;';
  let safeValues = [name, email, zipcode];

  client.query(sql, safeValues)
    .then(obj =>
    {
      response.status(200).redirect(`index/${obj.rows[0].id}`)
    })
}



function updateNotes(request, response)
{
  let id = request.params.id;
  let newNotes = request.body.notes;
  let sql = 'UPDATE notes SET user_notes=$1 WHERE id=$2 RETURNING plant_key;';

  let safeValues = [newNotes, id];

  client.query(sql, safeValues)
    .then(hope =>
    {
      let key = hope.rows[0].plant_key;
      response.status(200).redirect(`/details/${key}`);
    })
}

function renderAboutUs(request, response)
{
  console.log('you are in about us', request.params);

  response.render('pages/aboutUs', {user : request.params.id});
}


client.connect()
  .then(() => {
    app.listen(PORT, () => console.log(`listening on ${PORT}`));
  }).catch(err => console.log('error connecting', err));
