/*
Copyright 2020 Google LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

// app.yaml reference: https://cloud.google.com/appengine/docs/standard/nodejs/config/appref
// service.yaml reference: https://github.com/knative/docs/blob/master/docs/serving/spec/knative-api-specification-1.0.md

/**
 * @param {Object} gaeService - Information about the App Engine service, should at minimum contain {"app.yaml" : {}}
 */
function appToRun(gaeService) {
  let runService = {
    'service.yaml': {
      'apiVersion': 'serving.knative.dev/v1',
      'kind': 'Service',
      'metadata': {
        'name' : 'default'
      },
      'spec': {
        'template': {
          'metadata': {
            'annotations': {}
          },
          'spec': {
            'containers': [
              {
                'image': 'gcr.io/YOUR-PROJECT/image'
              }
            ]
          }
        }
      }
    }
  };

  const extractFunctions = [
    extractName,
    extractImageURL,
    extractEnvVars,
    extractProjectIDEnvVar,
    extractMaxInstances,
    extractMinInstances,
    extractConcurrency,
    extractMemory,
    extractMigrateToSecondGen,
    extractDockerfile,
    extractVPCAccess,
    extractCloudSQL,
  ]
  
  for (const extractFunction of extractFunctions) {
    extractFunction(gaeService, runService);
  }

  return runService;
}


const runtimeToDockerfile = {
'nodejs': 
`FROM node:slim
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --only=production
COPY . ./
CMD [ "npm", "start" ]`,

'nodejs8': 
`FROM node:8-slim
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --only=production
COPY . ./
CMD [ "npm", "start" ]`,

'nodejs10': 
`FROM node:10-slim
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --only=production
COPY . ./
CMD [ "npm", "start" ]`,

'nodejs12': 
`FROM node:12-slim
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --only=production
COPY . ./
CMD [ "npm", "start" ]`,
}

const firstGenRuntimes = ['python27', 'php55', 'go111'];

const firstGenMigrationGuides = {
'go111': 'https://cloud.google.com/appengine/docs/standard/go/go-differences',
'python27': 'https://cloud.google.com/appengine/docs/standard/python/',
'php55': 'https://cloud.google.com/appengine/docs/standard/php7/php-differences',
// (Java does not use an app.yaml): 'https://cloud.google.com/appengine/docs/standard/java11/java-differences',
}

function extractName(gae, run) {
  if(gae['app.yaml']['service']) {
    run['service.yaml']['metadata']['name'] = gae['app.yaml']['service'];
   }
}

function extractEnvVars(gae, run) {
  if(gae['app.yaml']['env_variables']) {
    const container = run['service.yaml']['spec']['template']['spec']['containers'][0];
    container['env'] = container['env'] || [];
    for (const key of Object.keys(gae['app.yaml']['env_variables'])) {
      container['env'].push({
        'name': key,
        'value': gae['app.yaml']['env_variables'][key]
      })
    }
   }
}

function extractProjectIDEnvVar(gae, run) {
  if(gae['project-id']) {
    const container = run['service.yaml']['spec']['template']['spec']['containers'][0];
    container['env'] = container['env'] || [];
    container['env'].push({
      'name': 'GOOGLE_CLOUD_PROJECT',
      'value': gae['project-id']
    })
   }
}

function extractMaxInstances(gae, run) {
  if(gae['app.yaml']['automatic_scaling']?.['max_instances']) {
    run['service.yaml']['spec']['template']['metadata']['annotations']['autoscaling.knative.dev/maxScale'] = gae['app.yaml']['automatic_scaling']['max_instances'].toString(); 
   }
}

function extractMinInstances(gae, run) {
  if(gae['app.yaml']['automatic_scaling']?.['min_instances']) {
    run['service.yaml']['spec']['template']['metadata']['annotations']['autoscaling.knative.dev/minScale'] = gae['app.yaml']['automatic_scaling']['inx_instances'].toString(); 
   }
}

function extractConcurrency(gae, run) {
  if(gae['app.yaml']['automatic_scaling']?.['max_concurrent_requests']) {
    run['service.yaml']['spec']['template']['spec']['containerConcurrency'] = gae['app.yaml']['automatic_scaling']['max_concurrent_requests']; 
   }
} 

function extractMemory(gae, run) {
  // see https://cloud.google.com/appengine/docs/standard/#instance_classes

  const instanceClassMemory = {
    'F1': '256Mi',
    'F2': '512Mi',
    'F4': '1Gi',
    'F4_HIGHMEM': '2Gi', 
  }

  if(gae['app.yaml']['instance_class']) {
    const container = run['service.yaml']['spec']['template']['spec']['containers'][0];
    
    container['resources'] = container['resources'] || {'limits': {}};

    container['resources']['limits']['memory'] = instanceClassMemory[gae['app.yaml']['instance_class']]; 
   }
}

function extractMigrateToSecondGen(gae, run) {
  const runtime = gae['app.yaml']['runtime'];
  // "api_version" was deprecated for secnd gen runtimes
  if(gae['app.yaml']['api_version'] || firstGenRuntimes.includes(runtime)) {
    run['migrate-to-second-gen'] = true;
    run['migration-guide'] = firstGenMigrationGuides[runtime];
  }
}

function extractDockerfile(gae, run) {
  run['Dockerfile'] = runtimeToDockerfile[gae['app.yaml']['runtime']]
}

function extractVPCAccess(gae, run){
  if(gae['app.yaml']['vpc_access_connector']?.['name']) {
    run['service.yaml']['spec']['template']['metadata']['annotations']['run.googleapis.com/vpc-access-connector'] = gae['app.yaml']['vpc_access_connector']['name'];
  }
}

function extractCloudSQL(gae, run) {
  if(gae['cloudsql-instance']) {
    run['service.yaml']['spec']['template']['metadata']['annotations']['run.googleapis.com/cloudsql-instances'] = [gae['project-id'], gae['region'], gae['cloudsql-instance']].join(':'); 
  }
}

function extractImageURL(gae, run) {
  let imageName = gae['app.yaml']['service'] || 'image';
  let projectName = gae['project-id'] || '<YOUR-PROJECT>';
  
  run['service.yaml']['spec']['template']['spec']['containers'][0]['image'] = `gcr.io/${projectName}/${imageName}`;
}

export {appToRun}
