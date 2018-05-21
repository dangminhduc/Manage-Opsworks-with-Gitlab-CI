const MONITORING_STACKS=["appfactory","adfactory","gamefactory","sugoroku-pr","mediafactory","bingo","metric","appfactory-STG","adfactory-STG","gamefactory-STG","sugoroku-pr-STG","mediafactory-STG","bingo-STG"];
// Function for posting to Slack
function postToSlack(messageText) {
    const https = require('https');
    const url = require('url');
    const slack_url = 'https://hooks.slack.com/services/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'; //lambda-test channel
    const slack_req_opts = url.parse(slack_url);
    slack_req_opts.method = 'POST';
    slack_req_opts.headers = { 'Content-Type': 'application/json' };

    var req = https.request(slack_req_opts, function(res) {
        if (res.statusCode === 200) {
            console.log("Message posted to slack");
        }
        else {
            console.log("Error status code: " + res.statusCode);
        }
    });

    req.on('error', function(e) {
        console.log("problem with request: " + e.message);
        console.log(e.message);
    });

    req.write(JSON.stringify({ text: messageText }));
    req.end();

}

function deploymentStatusCheck() {
    var aws = require('aws-sdk');
    aws.config.region = 'us-east-1';
    var opsworks = new aws.OpsWorks({ apiVersion: '2013-02-18' });
    var before = Math.floor(new Date().getTime() / 1000) - 60;
    opsworks.describeStacks(function(err, data) {
        if (err) {
            console.log(err.message);
            postToSlack(":exclamation: Can not get information of any stacks");
        } // an error occurred
        else { // successful response
            var stacks = data.Stacks;
            console.log("Number of stacks: "+ stacks.length);
            for (var i=0;i<stacks.length; i++) {
                var stack = stacks[i];
                let stackName = stack.Name;
                let stackId = stack.StackId;
                if (stack.Name === 'appfactory' || stack.Name === 'adfactory' || stack.Name === 'gamefactory' || stack.Name === 'sugoroku-pr' || stack.Name === 'mediafactory' || stack.Name === 'bingo' || stack.Name === 'metric' || stack.Name === 'appfactory-STG' || stack.Name === 'adfactory-STG' || stack.Name === 'gamefactory-STG' || stack.Name === 'sugoroku-pr-STG' || stack.Name === 'mediafactory-STG' || stack.Name === 'bingo-STG'){
                    var params = {StackId: stack.StackId};
                    opsworks.describeDeployments(params, function(err,data){
                    if (err){
                        console.log(err.message);
                    }
                    else{
                        // console.log(stackName+ ": "+ stackId);
                        var deployments = data.Deployments;
                        // console.log("Num of deployments: "+deployments.length);
                        for (var i=0;i<deployments.length;i++){
                            var deploy = deployments[i];
                            let deployID = deploy.DeploymentId;
                            let deployName = deploy.Command.Name;
                            let deployComment = deploy.Comment;
                            let deployStatus = deploy.Status;
                            // console.log("deployID:"+deploy.DeploymentId);
                            var created_at = Math.floor(new Date(deploy.CreatedAt).getTime() / 1000);
                            // console.log("Deploy started at:" + deploy.CreatedAt+"->"+created_at);
                            // var completed_at = 0;
                            if (deploy.CompletedAt === ""){
                                completed_at = 0;
                            }
                            else{
                                completed_at = Math.floor(new Date(deploy.CompletedAt).getTime() / 1000);
                                // console.log("Deploy completed at:" + deploy.CompletedAt+"->"+completed_at);
                            }
                            
                            if (before <= created_at){
                                console.log("Go to created_at");
                                    opsworks.describeInstances({InstanceIds: deploy.InstanceIds}, function(err,data){
                                        if (err){
                                            console.log(err.message);
                                        }
                                        else {
                                            var instance_list = [];
                                            var instances = data.Instances;
                                            for (var i = 0; i<instances.length;i++){
                                                var instance = instances[i];
                                                instance_list.push("- " + instance.Hostname + " (" + instance.PrivateIp + ")");
                                            }
                                            var msg = ":opsworks_icon: A deploy has been started \n ```\n ID: " + deployID + " \n Command: " + deployName + " \n Comment: " + deployComment + " \n [Instances] \n" + (instance_list.join('\n')) + " \n ```\n";
                                            console.log(msg);
                                            postToSlack(msg);
                                        }
                                    });
                                }
                            if (before <= completed_at){
                                console.log("Go to completed_at");
                                    opsworks.describeInstances({InstanceIds: deploy.InstanceIds}, function(err,data){
                                        if (err){
                                            console.log(err.message);
                                        }
                                        else {
                                            var instance_list = [];
                                            var instances = data.Instances;
                                            for (var i = 0; i<instances.length;i++){
                                                var instance = instances[i];
                                                instance_list.push("- " + instance.Hostname + " (" + instance.PrivateIp + ")");
                                            }
                                            var emoji = 'unknown';
                                            var end_status = 'unknown';
                                            
                                            if (deploy.Status === "successful"){
                                               emoji = ':white_check_mark:';
                                               end_status = 'OK'; 
                                            }
                                        
                                            if (deploy.Status === "failed") {
                                                emoji = ':exclamation:';
                                                end_status = 'NG';
                                                }
                                            
                                            var msg = ":opsworks_icon: A deployment has been finished " + emoji + " " + end_status + " \n ```\n ID: " + deployID + " \n Status : " + deployStatus + " \n Command: " + deployName + " \n Comment: " + deployComment + " \n [Instances] \n" + (instance_list.join('\n')) + " \n ```\n";
                                            console.log(msg)
                                            postToSlack(msg);
                                        }
                                    });
                                
                                }                                
                        }
                    }
                });
                
                }
            }

        }
    });
}

exports.handler = (event, context, callback) => {
    // TODO implement
    deploymentStatusCheck();
};
