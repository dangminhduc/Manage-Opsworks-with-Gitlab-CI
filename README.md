# Using Gitlab CI to manage automatic deployment to AWS Opsworks

Before this, after pushing a commit to Gitlab, our developer need to login into AWS Opsworks console, create a deployment (in case of Rails application deployment, they need to write a custom JSON that define which branch to deploy, option to migrate database or not). I decide to use Gitlab CI to reduce the complicated works to make a deployment.

First of all, the architecture.
![alt text](https://i.imgur.com/L2hpsDC.png)
Generally, our architecture is divide into 3 major steps:

Step 1: Developer push a commit or make a merge request into Gitlab
Step 2: The pipeline is contains 3 small step

* code review: Using code climate to evaluate source code quality (sorry but I'm still working on this step)
* Java maven build: In case of Java application, using mvn command to build java source code into a war file to deploy. Base on branch name, we will setup gitlab-ci to select appropriate profile to build. In the end, we will use aws-cli to push war file to s3 for deploying later
* Commence deployment: Using aws-cli to call Opsworks deploy command

Each step above will be executed inside a docker container
Step 3: There is an external server that frequently check for deployment status for any update. When a deployment finish, it will notify that deployment status to developers via a Slack channel (we're using Slack at work)

First, enable pipelines for the project
In GitLab project panel, select Settings → Generals → Permissions→ Turn on [Pipelines] → Save changes
![alt text](https://i.imgur.com/sN2u5iy.png)
![alt text](https://i.imgur.com/GmKHrsz.png)
Then, create CI settings file (.gitlab-ci.yml) under project's root folder. Below is the sample file for rails application deployment.

```
stages:
  - code-review
  - test
  - deploy

variables:
  # You may put it in gitlab secrete variables 
  APP_NAME: "xxxxxxxx" #Staging application name from Opsworks console
  #STG parameter
  STG_STACK_ID: "xxxxxxxxx" #Staging stack ID from Opsworks console
  STG_LAYER_ID: "xxxxxxxxxxxx" #Staging layer ID
  STG_APP_ID : "xxxxxxxxx" #Staging application ID from Opsworks console
  
  #PROD parameter
  PROD_STACK_ID: "xxxxxxxxx" #Production stack ID from Opsworks console
  PROD_LAYER_ID: "xxxxxxxxxxxx" #Production layer ID
  PROD_APP_ID : "xxxxxxxxx" #Production application ID from Opsworks console

code review:
  image: docker:latest
  stage: code-review
  variables:
    DOCKER_DRIVER: overlay
  services:
    - docker:dind
  script:
    - docker info
    - docker pull codeclimate/codeclimate
    - docker run --env CODECLIMATE_CODE="$PWD" --volume "$PWD":/code --volume /var/run/docker.sock:/var/run/docker.sock --volume /tmp/cc:/tmp/cc codeclimate/codeclimate:0.69.0 init
    - docker run --env CODECLIMATE_CODE="$PWD" --volume "$PWD":/code --volume /var/run/docker.sock:/var/run/docker.sock --volume /tmp/cc:/tmp/cc codeclimate/codeclimate:0.69.0 analyze -f json > codeclimate.json || true
  artifacts:
    paths: [codeclimate.json]
  except:
    - master

test_job: 
  stage: test
  image: netmile/adgame-build:latest #This image includes maven and aws-cli
  script:
    - which aws
    - ls -l ./
    - pwd
  except:
    - master

deploy to staging with no migration:
  stage: deploy
  image: netmile/adgame-build:latest 
  environment: staging
  script:
    - aws opsworks --region us-east-1 create-deployment --stack-id $STACK_ID --app-id $APP_ID --layer-ids $LAYER_ID --command "{\"Name\":\"deploy\"}" --custom-json "{\"deploy\":{\"$APP_NAME\":{\"scm\":{\"revision\":\"$CI_COMMIT_REF_NAME\"}}}}" --comment "$CI_COMMIT_REF_NAME"
  when: manual
  only:
    - /^f_*/ #future branch must have "f_" prefix
    - dev

deploy to staging with migration:
  stage: deploy
  image: netmile/adgame-build:latest
  environment: adgame_admin_staging
  script:
    - aws opsworks --region us-east-1 create-deployment --stack-id $STACK_ID --app-id $APP_ID --layer-ids $LAYER_ID --command "{\"Name\":\"deploy\"}" --custom-json "{\"deploy\":{\"$APP_NAME\":{\"scm\":{\"revision\":\"$CI_COMMIT_REF_NAME\"},\"migrate\":true}}}" --comment "$CI_COMMIT_REF_NAME"
  when: manual
  only:
    - /^f_*/
    - dev

deploy to production with no migration:
  stage: deploy
  image: netmile/adgame-build:latest
  environment: adgame_admin_production
  script:
    - aws opsworks --region us-east-1 create-deployment --stack-id $STACK_ID --app-id $APP_ID --layer-ids $LAYER_ID --command "{\"Name\":\"deploy\"}" --custom-json "{\"deploy\":{\"$APP_NAME\":{\"scm\":{\"revision\":\"$CI_COMMIT_REF_NAME\"}}}}" --comment "$CI_COMMIT_REF_NAME"
  when: manual
  only:
    - /^prod_*/  #release tag must have "prod_" prefix

deploy to production with migration:
  stage: deploy
  image: netmile/adgame-build:latest
  environment: adgame_admin_production
  script:
    - aws opsworks --region us-east-1 create-deployment --stack-id $STACK_ID --app-id $APP_ID --layer-ids $LAYER_ID --command "{\"Name\":\"deploy\"}" --custom-json "{\"deploy\":{\"$APP_NAME\":{\"scm\":{\"revision\":\"$CI_COMMIT_REF_NAME\"},\"migrate\":true}}}" --comment "$CI_COMMIT_REF_NAME"
  when: manual
  only:
    - /^prod_*/
```

In case of Java application:

```
stages:
  - code-review
  - test
  - build and deploy

variables:
  # You may put it in gitlab secrete variables 
  APP_NAME: "xxxxxxxx" #Staging application name from Opsworks console
  #STG parameter
  STG_S3_WAR_FOLDER: "s3://java-app/stg/" # use the same path with which you set in Opsworks console
  STG_STACK_ID: "xxxxxxxxx" #Staging stack ID from Opsworks console
  STG_LAYER_ID: "xxxxxxxxxxxx" #Staging layer ID
  STG_APP_ID : "xxxxxxxxx" #Staging application ID from Opsworks console
  
  #PROD parameter
  PROD_S3_WAR_FOLDER: "s3://java-app/prod/"
  PROD_STACK_ID: "xxxxxxxxx" #Production stack ID from Opsworks console
  PROD_LAYER_ID: "xxxxxxxxxxxx" #Production layer ID
  PROD_APP_ID : "xxxxxxxxx" #Production application ID from Opsworks console

code review:
  image: docker:latest
  stage: code-review
  variables:
    DOCKER_DRIVER: overlay
  services:
    - docker:dind
  script:
    - docker info
    - docker pull codeclimate/codeclimate
    - docker run --env CODECLIMATE_CODE="$PWD" --volume "$PWD":/code --volume /var/run/docker.sock:/var/run/docker.sock --volume /tmp/cc:/tmp/cc codeclimate/codeclimate:0.69.0 init
    - docker run --env CODECLIMATE_CODE="$PWD" --volume "$PWD":/code --volume /var/run/docker.sock:/var/run/docker.sock --volume /tmp/cc:/tmp/cc codeclimate/codeclimate:0.69.0 analyze -f json > codeclimate.json || true
  artifacts:
    paths: [codeclimate.json]
  except:
    - master
    
test stage:
  stage: test
  image: netmile/adgame-build:latest
  script:
    - which aws
    - ls -l ./
    - pwd
  except:
    - master

# build and deployment stage
build and deploy to staging:
  stage: build and deploy
  environment: staging
  image: netmile/adgame-build:latest
  script:
    - mvn -Dbranch=$CI_COMMIT_REF_NAME -P stg_properties clean compile war:war
    - aws s3 cp ./target/adgms.war $STG_S3_WAR_FOLDER
    - aws opsworks --region us-east-1 create-deployment --stack-id $STACK_ID --app-id $APP_ID --layer-ids $LAYER_ID --command "{\"Name\":\"deploy\"}" --comment "$CI_COMMIT_REF_NAME"
  when: manual
  only:
    - /^f_*/
    - dev

build and deploy to production:
  stage: build and deploy
  environment: production
  image: netmile/adgame-build:latest
  script:
    - mvn -Dbranch=$CI_COMMIT_REF_NAME -P prod_properties clean compile war:war
    - aws s3 cp ./target/adgms.war $PROD_S3_WAR_FOLDER
    - aws opsworks --region us-east-1 create-deployment --stack-id $STACK_ID --app-id $APP_ID --layer-ids $LAYER_ID --command "{\"Name\":\"deploy\"}" --comment "$CI_COMMIT_REF_NAME"
  when: manual
  only:
    - /^prod_.*/
```

Next, we will setup secrete variables for the project. What we need here is AWS access key and secrete key of a user that has permission to write into s3 bucket (for storing java war file) and permission to call Opsworks deploy command. 
The user's permission is defined below:

```
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "Stmt1434613487000",
            "Effect": "Allow",
            "Action": [
                "s3:*"
            ],
            "Resource": [
                "arn:aws:s3:::java-app",
                "arn:aws:s3:::java-app/*"
            ]
        },
        {
            "Effect": "Allow",
            "Action": "s3:ListAllMyBuckets",
            "Resource": "*"
        },
         {
            "Sid": "Stmt1413336234000",
            "Effect": "Allow",
            "Action": "opsworks:CreateDeployment",
            "Resource": [
                *your layer ID's arn goes here*
            ]
        }
    ]
}
```

After creating user with permission above, create a new access key and secrete key and set them up in Gitlab secrete variables like this
![alt text](https://i.imgur.com/9SHx6Qc.png)
In CI/CD runners settings, take the runner registration token to use later in runner setup
![alt text](https://i.imgur.com/cqJN182.png)
In Gitlab runner server, run this command below 

```
sudo gitlab-runner register -n --url http://<gitlab server URL> --registration-token [registration token goes here] --executor docker --description “docker-in-docker” --docker-image "docker:latest" --docker-volumes /var/run/docker.sock:/var/run/docker.sock
```

Now push a commit with a appropriate branch's name, go to CI/CD section and make your first deployment.
![alt text](https://i.imgur.com/BGvN8xf.png)
For the notification to Slack channel, we have 2 choice. 

1. We can use Lambda function with a CloudWatch event to trigger it like a normal crontab. This have a downside. The minimum setup in CloudWatch event is 60 seconds, so you can only run the job once in a minute. The bright side is, of course, you don't have to manage any server at all, just put the source code into Lambda and config it right and you good to go
2. If you want to monitor opsworks deployment more precisely (for example every 10 seconds), you can launch a EC2 instance and config a crontab inside. (Just remember, if you call the aws api too many time in a period of time, you may get response exception, so choose the crontab frequent above 10 seconds)

I will go with option 1 because it easy to config and this notification part is not production critical. 
In Lambda console, create a new function.
![alt text](https://i.imgur.com/z2R3tc2.png)
The function must have appropriate role. In securities credentials console, create a role with json file below.

```
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
                "logs:PutLogEvents"
            ],
            "Resource": "arn:aws:logs:*:*:*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "opsworks:Describe*"
            ],
            "Resource": [
                "*"
            ]
        }
    ]
}
```

After creating Lambda function, copy the file OpsworkDeploymentCheck.js to the code IDE. 
Then, we need to config function basic settings.
![alt text](https://imgur.com/AeoQPmX.png)
With 128MB of memory, it will take several seconds for the function to complete, so we need to change function timeout from 3 seconds (default) to 30 secs or something below 1 min.

In CloudWatch console, create an event rule that run every minute to trigger the Lambda function.
![alt text](https://imgur.com/6ksjI5z.png)
In targets configuration, choose the lambda function that we have created above.
That's all. Every time when a deployment occur in opsworks, there will be a message sent to slack channel.
![alt text](https://imgur.com/VTGkHlz.png)
