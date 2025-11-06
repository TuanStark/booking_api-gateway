pipeline {
    agent any
    
    environment {
        SERVICE_NAME = 'api-gateway'
        SERVICE_PORT = '3000'
        DOCKER_IMAGE = "dorm-booking/${SERVICE_NAME}"
        DOCKER_TAG = "${BUILD_NUMBER}"
        NODE_VERSION = '18'
        // TODO: Thay đổi 'your-dockerhub-username' thành username Docker Hub của bạn
        DOCKER_HUB_USERNAME = 'tuanstark'
        // Docker Hub registry URL
        DOCKER_REGISTRY = 'https://index.docker.io/v1/'
        // LƯU Ý: Đây chỉ là ID tham chiếu, KHÔNG phải secret!
        // Username/password thực tế được lưu an toàn trong Jenkins Credentials Store
        // ID này chỉ để Jenkins biết lấy credentials nào từ store
        // TODO: Đảm bảo credentials ID này khớp với ID trong Jenkins Credentials
        DOCKER_CREDENTIALS_ID = 'docker-credentials'
    }
    
    stages {
        stage('Checkout') {
            steps {
                checkout scm
                script {
                    env.GIT_COMMIT_SHORT = sh(
                        script: "git rev-parse --short HEAD",
                        returnStdout: true
                    ).trim()
                }
            }
        }
        
        stage('Install Dependencies') {
            steps {
                sh 'npm ci'
            }
        }
        
        stage('Lint & Format') {
            steps {
                sh 'npm run lint'
                sh 'npm run format'
            }
        }
        
        stage('Unit Tests') {
            steps {
                sh 'npm test -- --coverage --watchAll=false'
            }
            post {
                always {
                    publishTestResults testResultsPattern: 'coverage/test-results.xml'
                    publishCoverage adapters: [
                        jacocoAdapter('coverage/lcov.info')
                    ], sourceFileResolver: sourceFiles('STORE_LAST_BUILD')
                }
            }
        }
        
        stage('Build Application') {
            steps {
                sh 'npm run build'
            }
        }
        
        stage('Build Docker Image') {
            steps {
                script {
                    docker.build("${DOCKER_IMAGE}:${DOCKER_TAG}", "-f ./Dockerfile .")
                }
            }
        }
        
        stage('Security Scan') {
            steps {
                script {
                    sh "trivy image --exit-code 0 --severity HIGH,CRITICAL ${DOCKER_IMAGE}:${DOCKER_TAG}"
                }
            }
        }

        stage('Push Docker Image') {
            steps {
                script {
                    // Image name trên Docker Hub: username/repo-name:tag
                    def dockerHubImage = "${DOCKER_HUB_USERNAME}/${DOCKER_IMAGE}:${DOCKER_TAG}"
                    def dockerHubImageLatest = "${DOCKER_HUB_USERNAME}/${DOCKER_IMAGE}:latest"
                    
                    docker.withRegistry("${DOCKER_REGISTRY}", "${DOCKER_CREDENTIALS_ID}") {
                        // Tag image với Docker Hub username
                        sh "docker tag ${DOCKER_IMAGE}:${DOCKER_TAG} ${dockerHubImage}"
                        sh "docker tag ${DOCKER_IMAGE}:${DOCKER_TAG} ${dockerHubImageLatest}"
                        
                        // Push cả 2 tags
                        sh "docker push ${dockerHubImage}"
                        sh "docker push ${dockerHubImageLatest}"
                    }
                }
            }
        }
        
        // TODO: Uncomment when Docker registry and infrastructure are ready
        /*
        stage('Deploy to Staging') {
            when {
                branch 'develop'
            }
            steps {
                script {
                    sh """
                        kubectl set image deployment/${SERVICE_NAME} ${SERVICE_NAME}=${DOCKER_IMAGE}:${DOCKER_TAG} -n staging
                        kubectl rollout status deployment/${SERVICE_NAME} -n staging --timeout=300s
                    """
                }
            }
        }
        
        stage('Deploy to Production') {
            when {
                branch 'main'
            }
            steps {
                script {
                    sh """
                        kubectl set image deployment/${SERVICE_NAME} ${SERVICE_NAME}=${DOCKER_IMAGE}:${DOCKER_TAG} -n production
                        kubectl rollout status deployment/${SERVICE_NAME} -n production --timeout=300s
                    """
                }
            }
        }
        */
    }
    
    post {
        always {
            cleanWs()
        }
        success {
            script {
                // TODO: Uncomment when deployment is ready
                /*
                if (env.BRANCH_NAME == 'main') {
                    slackSend(
                        channel: '#deployments',
                        color: 'good',
                        message: "✅ ${SERVICE_NAME} deployed successfully to production! 🚀"
                    )
                }
                */
                echo "✅ ${SERVICE_NAME} build completed successfully!"
            }
        }
        failure {
            script {
                // TODO: Uncomment when deployment is ready
                /*
                slackSend(
                    channel: '#deployments',
                    color: 'danger',
                    message: "❌ ${SERVICE_NAME} deployment failed! Check Jenkins logs."
                )
                */
                echo "❌ ${SERVICE_NAME} build failed! Check logs."
            }
        }
    }
    triggers {
        pollSCM('H/5 * * * *')
    }
}
