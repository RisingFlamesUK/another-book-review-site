import * as ol from './ol-handler.js'
import * as utils from './utils.js'
import * as db from './utils/db-handler.js';


export async function getEditionData(edition_olid, mode, user_id) {
    // mode will be used to determine if we get only 'cached', only 'uncached', or 'all'
    // 'cached' - will only call the database for the data (if it's there)
    // 'uncached' - will only call the Open Library API
    // 'all' - will prioritise data from the database and fall back to the Open Library API if it's not cached
    // If there is no user then any user related fields will be null
    //
    // returns:
    // {
    //      isEditionCached: BOOLEAN,
    //      isWorkCached: BOOLEAN,
    //      edition_olid: edition_olid,
    //      work_olid: work_olid,
    //      languages: [ language, language ],
    //      title: title,
    //      publish_date: publish_date || null,
    //      myScore: myScore || null,
    //      myReveiew: myReview || null,
    //      workScore: workScore ||null, 
    //      description: description || null,
    //      authors: [                 
    //                  {   
    //                      isAuthorCached: BOOLEAN,
    //                      edition_olid: edition_olid,
    //                      author_olid: author_olid,
    //                      name: name,
    //                      bio: bio,
    //                      birth_date: birth_date,
    //                      death_date: death_date,
    //                      pic_url: pic_url
    //                   }
    //               ] || null,
    //      status_id: status_id || null,
    //      cover_url: cover_url || null,
    // }

    if (!edition_olid || !mode || mode !== "cached" && mode !== "uncached" && mode !== "all") {
        throw new Error('Edition OLID and mode (cached, uncached or all) is required.');
    }

    try {
        let isEditionCached = utils.checkCache('edition_olid', edition_olid);
        let myScore = null;
        let myReveiew = null;
        let workScore = null;
        let authors = null;
        let status_id = null;
        let editionResponse = null;

        //Get Edition info from OL books API if , otherwise get it from the database
        if (isEditionCached && mode === 'cached' || isEditionCached && mode === 'all') {
            console.log(`Cached: Getting edition data from Database: ${edition_olid}`);
            editionResponse = await db.getEdition(edition_olid);
            if (!editionResponse || !editionResponse.work_olid) {
                throw new Error(`Failed to retrieve valid edition data for OLID: ${edition_olid}`);
            }

            
            // check that work_olid is cached (it should be - if not then we should download and cache it)
            let isWorkCached = utils.checkCache('work_olid', work_olid);
            if (!isWorkCached) {
                console.log(`Processing uncached work: ${work_olid}`);
                console.log("WRITE THIS CODE");
            }

            // get languages and add to editionResponse
            editionResponse.languages = db.getEditionLanguages(edition_olid);

            // get authors and add to editionResponse

        } else {
            console.log(`Uncached: Getting edition data from Open Library: ${edition_olid}`);

            editionResponse = await ol.getData("edition", edition_olid);
            if (!editionResponse || !editionResponse.work_olid) {
                throw new Error(`Failed to retrieve valid edition data for OLID: ${edition_olid}`);
            }

            //get authors and add to editionResponse
        }
        
        let work_olid = editionResponse.work_olid;
        let title = editionResponse.title;
        let publish_date = editionResponse.publish_date;
        let description = editionResponse.description;
        let cover_url = editionResponse.cover_url;
        let languages = editionResponse.languages

    } catch (error) {
        console.error(`Error in selectedEdition for user ${user_id}, edition ${edition_olid}:`, error.message);
        // Re-throw the error so the calling function (e.g., app.post('/edition')) can handle it
        throw error;
    }
}

export async function getWorkData(work_olid, mode) {
    //mode will be used to determine if we get only 'cached', only 'uncached', or 'all'

}

