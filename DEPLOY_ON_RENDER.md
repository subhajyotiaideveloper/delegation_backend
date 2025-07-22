# How to Deploy Your Node.js Backend to Render

This guide will walk you through the process of deploying your Node.js application to Render.

## Prerequisites

*   A Render account (you can sign up for free).
*   Your code pushed to a GitHub repository.

## Deployment Steps

1.  **Create a New Web Service on Render:**
    *   Go to your Render Dashboard and click **New +** > **Web Service**.
    *   Connect your GitHub account and select the repository for this project.

2.  **Configure the Web Service:**
    *   **Name:** Give your service a name (e.g., `my-auth-backend`).
    *   **Region:** Choose a region close to you or your users.
    *   **Branch:** Select the branch you want to deploy (e.g., `main`).
    *   **Root Directory:** `project/backend`
    *   **Runtime:** `Node`
    *   **Build Command:** `npm install`
    *   **Start Command:** `npm start`
    *   **Instance Type:** `Free` (or a paid plan if you need more resources).

3.  **Add Environment Variables:**
    *   Under the **Environment** section, click **Add Environment Variable**.
    *   Add the following variables:
        *   `DATABASE_URL`: Your Neon database connection string.
        *   `JWT_SECRET`: A long, random, and secret string for signing JWTs.

4.  **Deploy:**
    *   Click **Create Web Service**. Render will automatically build and deploy your application.
    *   You can monitor the deployment logs in the **Events** tab.

5.  **Access Your Deployed Application:**
    *   Once the deployment is complete, Render will provide you with a public URL for your backend (e.g., `https://my-auth-backend.onrender.com`).
    *   You can use this URL in your frontend application to make API requests.

## Important Notes

*   **`.gitignore`:** Ensure your `.gitignore` file includes `.env` and `node_modules` to prevent them from being committed to your repository.
*   **Health Checks:** Render will automatically perform health checks on your service. If your application fails to start or respond to requests, the deployment will be marked as failed.
*   **Logs:** You can view your application logs at any time in the **Logs** tab on your Render dashboard. This is useful for debugging any issues that may arise.